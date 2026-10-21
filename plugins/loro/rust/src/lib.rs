//! zinc:loro native core: a C ABI over the `loro` crate for plugins/loro/native/loro.host.cpp.
//!
//! Documents and ephemeral stores are integer handles into per-thread tables; containers are named by their container id
//! string ("cid:root-blocks:Tree", "cid:12@3:Map"), so the C++ side keeps no container object. Strings come in as UTF-8
//! (pointer, length); a result that is bytes or text goes into one per-thread buffer, `zl_out()`, which the caller copies
//! before the next call, and the call returns its length (or -1: the reason is in `zl_error()`). Values cross as JSON; a
//! child container inside a value is loro's own "🦜:cid:..." string. Events are queued as JSON when they happen (inside
//! commit, import, checkout) and drained by the caller, so nothing calls back into the engine.
use loro::awareness::{EphemeralEventTrigger, EphemeralStore};
use loro::event::{Diff, DiffEvent, ListDiffItem};
use loro::{
    CommitOptions, Container, ContainerID, ContainerTrait, EventTriggerKind, ExpandType, ExportMode, Frontiers, Index,
    LoroDoc, LoroList, LoroMap, LoroText, LoroTree, LoroValue, StyleConfig, StyleConfigMap, Subscription, TextDelta,
    TreeExternalDiff, TreeID, TreeParentId, ValueOrContainer, VersionVector, ID,
};
use serde_json::{json, Map as JMap, Value as J};
use std::cell::RefCell;
use std::collections::VecDeque;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Arc, Mutex};

type Queue<T> = Arc<Mutex<VecDeque<T>>>;

struct DocSlot {
    doc: LoroDoc,
    events: Queue<String>,
    updates: Queue<Vec<u8>>,
    subs: Vec<Subscription>,
}
struct EphSlot {
    store: EphemeralStore,
    events: Queue<String>,
    updates: Queue<Vec<u8>>,
    _subs: Vec<Subscription>,
}

#[derive(Default)]
struct State {
    docs: Vec<Option<DocSlot>>,
    ephs: Vec<Option<EphSlot>>,
    out: Vec<u8>,
    err: String,
}

thread_local! { static ST: RefCell<State> = RefCell::new(State::default()); }

type R<T> = Result<T, String>;

fn fail<T>(e: impl std::fmt::Display) -> R<T> {
    Err(e.to_string())
}
fn set_err(e: String) {
    ST.with(|s| s.borrow_mut().err = e);
}
fn set_out(b: Vec<u8>) -> i64 {
    let n = b.len() as i64;
    ST.with(|s| s.borrow_mut().out = b);
    n
}

/// Runs `f`, turning an error or a panic of the library into -1 and a message.
fn guard(f: impl FnOnce() -> R<i64>) -> i64 {
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(Ok(n)) => n,
        Ok(Err(e)) => {
            set_err(e);
            -1
        }
        Err(p) => {
            let m = p
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| p.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "panic".into());
            set_err(format!("loro: {m}"));
            -1
        }
    }
}
fn ok(f: impl FnOnce() -> R<()>) -> i64 {
    guard(|| f().map(|_| 0))
}
fn text_out(f: impl FnOnce() -> R<String>) -> i64 {
    guard(|| f().map(|s| set_out(s.into_bytes())))
}
fn bytes_out(f: impl FnOnce() -> R<Vec<u8>>) -> i64 {
    guard(|| f().map(set_out))
}

unsafe fn st<'a>(p: *const u8, n: usize) -> std::borrow::Cow<'a, str> {
    if n == 0 {
        return "".into();
    }
    String::from_utf8_lossy(std::slice::from_raw_parts(p, n))
}
unsafe fn by<'a>(p: *const u8, n: usize) -> &'a [u8] {
    if n == 0 {
        return &[];
    }
    std::slice::from_raw_parts(p, n)
}

fn doc(h: i32) -> R<LoroDoc> {
    ST.with(|s| {
        s.borrow().docs.get(h as usize).and_then(|d| d.as_ref()).map(|d| d.doc.clone()).ok_or_else(|| "the document is closed".into())
    })
}
fn eph(h: i32) -> R<EphemeralStore> {
    ST.with(|s| {
        s.borrow().ephs.get(h as usize).and_then(|d| d.as_ref()).map(|d| d.store.clone()).ok_or_else(|| "the store is closed".into())
    })
}
fn put<T>(v: &mut Vec<Option<T>>, x: T) -> i32 {
    match v.iter().position(|d| d.is_none()) {
        Some(i) => {
            v[i] = Some(x);
            i as i32
        }
        None => {
            v.push(Some(x));
            (v.len() - 1) as i32
        }
    }
}

fn cid(s: &str) -> R<ContainerID> {
    ContainerID::try_from(s).or_else(|_| fail(format!("not a container id: {s}")))
}
fn tree_id(s: &str) -> R<TreeID> {
    TreeID::try_from(s).or_else(|_| fail(format!("not a tree node id: {s}")))
}
fn parent_of(s: &str) -> R<TreeParentId> {
    Ok(if s.is_empty() { TreeParentId::Root } else { TreeParentId::Node(tree_id(s)?) })
}
fn peer(s: &str) -> R<u64> {
    s.parse::<u64>().or_else(|_| fail(format!("not a peer id: {s}")))
}

// ---- values: JSON in (numbers are doubles, as a JavaScript number is in loro-crdt), JSON out
fn from_json(v: J) -> LoroValue {
    match v {
        J::Null => LoroValue::Null,
        J::Bool(b) => LoroValue::Bool(b),
        J::Number(n) => LoroValue::Double(n.as_f64().unwrap_or(0.0)),
        J::String(s) => LoroValue::String(s.into()),
        J::Array(a) => LoroValue::List(a.into_iter().map(from_json).collect::<Vec<_>>().into()),
        J::Object(o) => {
            LoroValue::Map(o.into_iter().map(|(k, v)| (k, from_json(v))).collect::<std::collections::HashMap<_, _>>().into())
        }
    }
}
fn value(s: &str) -> R<LoroValue> {
    serde_json::from_str::<J>(s).map(from_json).or_else(|e| fail(format!("not a JSON value: {e}")))
}
fn to_json(v: &LoroValue) -> J {
    J::from(v.clone())
}
/// A value or a container as JSON, the container as "🦜:<id>" (what loro's shallow values hold).
fn voc_shallow(v: &ValueOrContainer) -> J {
    match v {
        ValueOrContainer::Value(v) => to_json(v),
        ValueOrContainer::Container(c) => J::String(format!("🦜:{}", c.id())),
    }
}
fn shallow_text(v: Option<ValueOrContainer>) -> String {
    v.map(|v| voc_shallow(&v).to_string()).unwrap_or_default()   // "" is undefined
}
fn frontiers_json(f: &Frontiers) -> J {
    J::Array(f.iter().map(|id| json!({"peer": id.peer.to_string(), "counter": id.counter})).collect())
}
/// Frontiers as "counter@peer" ids joined with ',' (what the TypeScript side splits into OpIds).
fn frontiers_text(f: &Frontiers) -> String {
    f.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",")
}
fn frontiers(s: &str) -> R<Frontiers> {
    let mut ids = Vec::new();
    for x in s.split(',').filter(|x| !x.is_empty()) {
        ids.push(ID::try_from(x).or_else(|_| fail(format!("frontiers: not an id: {x}")))?);
    }
    Ok(Frontiers::from(ids))
}
/// [[peer, counter], ...]: pairs, since the TypeScript side reads them into a Map without walking an object's keys.
fn vv_json(vv: &VersionVector) -> J {
    J::Array(vv.iter().map(|(p, c)| json!([p.to_string(), *c])).collect())
}
fn delta_json(d: &[TextDelta]) -> J {
    fn attrs<S>(a: &Option<std::collections::HashMap<String, LoroValue, S>>, o: &mut JMap<String, J>) {
        if let Some(a) = a {
            if !a.is_empty() {
                o.insert("attributes".into(), J::Object(a.iter().map(|(k, v)| (k.clone(), to_json(v))).collect()));
            }
        }
    }
    J::Array(
        d.iter()
            .map(|x| {
                let mut o = JMap::new();
                match x {
                    TextDelta::Insert { insert, attributes } => {
                        o.insert("insert".into(), J::String(insert.clone()));
                        attrs(attributes, &mut o);
                    }
                    TextDelta::Retain { retain, attributes } => {
                        o.insert("retain".into(), json!(retain));
                        attrs(attributes, &mut o);
                    }
                    TextDelta::Delete { delete } => {
                        o.insert("delete".into(), json!(delete));
                    }
                }
                J::Object(o)
            })
            .collect(),
    )
}

// ---- events, shaped like loro-crdt's LoroEventBatch (containers inside a diff as their deep value)
fn event_json(e: &DiffEvent) -> String {
    let by = match e.triggered_by {
        EventTriggerKind::Local => "local",
        EventTriggerKind::Import => "import",
        EventTriggerKind::Checkout => "checkout",
    };
    let events: Vec<J> = e
        .events
        .iter()
        .map(|c| {
            let path: Vec<J> = c
                .path
                .iter()
                .map(|(_, i)| match i {
                    Index::Key(k) => J::String(k.to_string()),
                    Index::Seq(n) => json!(n),
                    Index::Node(t) => J::String(t.to_string()),
                })
                .collect();
            let diff = match &c.diff {
                Diff::Text(d) => json!({"type": "text", "diff": delta_json(d)}),
                Diff::List(items) => json!({"type": "list", "diff": items.iter().map(|x| match x {
                    ListDiffItem::Insert { insert, .. } => json!({"insert": insert.iter().map(|v| to_json(&v.get_deep_value())).collect::<Vec<_>>()}),
                    ListDiffItem::Delete { delete } => json!({"delete": delete}),
                    ListDiffItem::Retain { retain } => json!({"retain": retain}),
                }).collect::<Vec<_>>()}),
                Diff::Map(m) => json!({"type": "map", "updated": m.updated.iter().map(|(k, v)| (k.to_string(), v.as_ref().map(|v| to_json(&v.get_deep_value())).unwrap_or(J::Null))).collect::<JMap<_, _>>()}),
                Diff::Tree(t) => json!({"type": "tree", "diff": t.diff.iter().map(|x| {
                    let mut o = JMap::new();
                    o.insert("target".into(), J::String(x.target.to_string()));
                    let par = |p: &TreeParentId| match p { TreeParentId::Node(n) => Some(J::String(n.to_string())), _ => None };
                    match &x.action {
                        TreeExternalDiff::Create { parent, index, position } => {
                            o.insert("action".into(), "create".into());
                            if let Some(p) = par(parent) { o.insert("parent".into(), p); }
                            o.insert("index".into(), json!(index));
                            o.insert("fractionalIndex".into(), J::String(position.to_string()));
                        }
                        TreeExternalDiff::Move { parent, index, position, old_parent, old_index } => {
                            o.insert("action".into(), "move".into());
                            if let Some(p) = par(parent) { o.insert("parent".into(), p); }
                            o.insert("index".into(), json!(index));
                            o.insert("fractionalIndex".into(), J::String(position.to_string()));
                            if let Some(p) = par(old_parent) { o.insert("oldParent".into(), p); }
                            o.insert("oldIndex".into(), json!(old_index));
                        }
                        TreeExternalDiff::Delete { old_parent, old_index } => {
                            o.insert("action".into(), "delete".into());
                            if let Some(p) = par(old_parent) { o.insert("oldParent".into(), p); }
                            o.insert("oldIndex".into(), json!(old_index));
                        }
                    }
                    J::Object(o)
                }).collect::<Vec<_>>()}),
                _ => json!({"type": "unknown"}),
            };
            json!({"target": c.target.to_string(), "diff": diff, "path": path})
        })
        .collect();
    let mut o = json!({"by": by, "origin": e.origin, "events": events});
    if let Some(t) = &e.current_target {
        o["currentTarget"] = J::String(t.to_string());
    }
    o.to_string()
}

fn drain_text(q: &Queue<String>) -> String {
    let mut q = q.lock().unwrap();
    if q.is_empty() {
        return String::new();
    }
    format!("[{}]", q.drain(..).collect::<Vec<_>>().join(","))
}
fn drain_one(q: &Queue<Vec<u8>>) -> Vec<u8> {
    q.lock().unwrap().pop_front().unwrap_or_default()
}

// ==== the C ABI
#[no_mangle]
pub extern "C" fn zl_out() -> *const u8 {
    ST.with(|s| s.borrow().out.as_ptr())
}
#[no_mangle]
pub extern "C" fn zl_error() -> i64 {
    let e = ST.with(|s| s.borrow().err.clone());
    set_out(e.into_bytes())
}
#[no_mangle]
pub extern "C" fn zl_version() -> i64 {
    set_out(b"1.16.2".to_vec())
}

// ---- documents
#[no_mangle]
pub extern "C" fn zl_doc_new() -> i64 {
    guard(|| {
        let slot = DocSlot { doc: LoroDoc::new(), events: Default::default(), updates: Default::default(), subs: Vec::new() };
        Ok(ST.with(|s| put(&mut s.borrow_mut().docs, slot)) as i64)
    })
}
#[no_mangle]
pub extern "C" fn zl_doc_free(h: i32) {
    let slot = ST.with(|s| s.borrow_mut().docs.get_mut(h as usize).and_then(|d| d.take()));
    drop(slot); // outside the borrow: dropping the subscriptions runs loro code
}
/// Starts queueing events (what = 1) or local updates (what = 2) of the document; idempotent per kind.
#[no_mangle]
pub extern "C" fn zl_doc_listen(h: i32, what: i32) -> i64 {
    ok(|| {
        let d = doc(h)?;
        let (ev, up) = ST.with(|s| {
            let s = s.borrow();
            let slot = s.docs[h as usize].as_ref().unwrap();
            (slot.events.clone(), slot.updates.clone())
        });
        let sub = if what == 1 {
            d.subscribe_root(Arc::new(move |e: DiffEvent| ev.lock().unwrap().push_back(event_json(&e))))
        } else {
            d.subscribe_local_update(Box::new(move |b: &Vec<u8>| {
                up.lock().unwrap().push_back(b.clone());
                true
            }))
        };
        ST.with(|s| s.borrow_mut().docs[h as usize].as_mut().unwrap().subs.push(sub));
        Ok(())
    })
}
#[no_mangle]
pub extern "C" fn zl_doc_events(h: i32) -> i64 {
    text_out(|| {
        doc(h)?;
        Ok(ST.with(|s| s.borrow().docs[h as usize].as_ref().unwrap().events.clone()))
            .map(|q| drain_text(&q))
    })
}
#[no_mangle]
pub extern "C" fn zl_doc_next_update(h: i32) -> i64 {
    bytes_out(|| {
        doc(h)?;
        Ok(drain_one(&ST.with(|s| s.borrow().docs[h as usize].as_ref().unwrap().updates.clone())))
    })
}
#[no_mangle]
pub extern "C" fn zl_doc_peer(h: i32) -> i64 {
    text_out(|| Ok(doc(h)?.peer_id().to_string()))
}
#[no_mangle]
pub unsafe extern "C" fn zl_doc_set_peer(h: i32, p: *const u8, n: usize) -> i64 {
    ok(|| doc(h)?.set_peer_id(peer(&st(p, n))?).or_else(fail))
}
/// timestamp: seconds, or NaN for the clock (when timestamps are recorded).
#[no_mangle]
pub unsafe extern "C" fn zl_doc_commit(h: i32, m: *const u8, mn: usize, o: *const u8, on: usize, ts: f64) -> i64 {
    ok(|| {
        let mut opt = CommitOptions::new();
        if mn > 0 {
            opt = opt.commit_msg(&st(m, mn));
        }
        if on > 0 {
            opt = opt.origin(&st(o, on));
        }
        if !ts.is_nan() {
            opt = opt.timestamp(ts as i64);
        }
        doc(h)?.commit_with(opt);
        Ok(())
    })
}
#[no_mangle]
pub extern "C" fn zl_doc_record_timestamp(h: i32, on: bool) -> i64 {
    ok(|| Ok(doc(h)?.set_record_timestamp(on)))
}
/// {"bold": {"expand": "after"}, ...}
#[no_mangle]
pub unsafe extern "C" fn zl_doc_text_style(h: i32, p: *const u8, n: usize) -> i64 {
    ok(|| {
        let v: J = serde_json::from_str(&st(p, n)).or_else(fail)?;
        let mut map = StyleConfigMap::new();
        for (k, c) in v.as_object().ok_or("configTextStyle: not an object")? {
            let expand = match c["expand"].as_str().unwrap_or("after") {
                "before" => ExpandType::Before,
                "both" => ExpandType::Both,
                "none" => ExpandType::None,
                "after" => ExpandType::After,
                x => return fail(format!("configTextStyle: expand '{x}' (before, after, both or none)")),
            };
            map.insert(k.as_str().into(), StyleConfig::new().expand(expand));
        }
        Ok(doc(h)?.config_text_style(map))
    })
}
/// mode 0: snapshot; 1: updates since the encoded version vector `from` (all of them when it is empty).
#[no_mangle]
pub unsafe extern "C" fn zl_doc_export(h: i32, mode: i32, p: *const u8, n: usize) -> i64 {
    bytes_out(|| {
        let d = doc(h)?;
        let r = if mode == 0 {
            d.export(ExportMode::snapshot())
        } else if n == 0 {
            d.export(ExportMode::all_updates())
        } else {
            let vv = VersionVector::decode(by(p, n)).or_else(fail)?;
            d.export(ExportMode::updates(&vv))
        };
        r.or_else(fail)
    })
}
#[no_mangle]
pub unsafe extern "C" fn zl_doc_import(h: i32, p: *const u8, n: usize) -> i64 {
    text_out(|| {
        let s = doc(h)?.import(by(p, n)).or_else(fail)?;
        Ok(json!({"pending": s.pending.map(|p| vv_json(&p.iter().map(|(peer, r)| (*peer, r.1)).collect()))}).to_string())
    })
}
#[no_mangle]
pub extern "C" fn zl_doc_frontiers(h: i32) -> i64 {
    text_out(|| Ok(frontiers_text(&doc(h)?.state_frontiers())))
}
#[no_mangle]
pub extern "C" fn zl_doc_oplog_frontiers(h: i32) -> i64 {
    text_out(|| Ok(frontiers_text(&doc(h)?.oplog_frontiers())))
}
/// The version vector of the current state, or of the whole history (oplog), encoded.
#[no_mangle]
pub extern "C" fn zl_doc_version(h: i32, oplog: bool) -> i64 {
    bytes_out(|| {
        let d = doc(h)?;
        Ok(if oplog { d.oplog_vv() } else { d.state_vv() }.encode())
    })
}
#[no_mangle]
pub unsafe extern "C" fn zl_doc_frontiers_to_vv(h: i32, p: *const u8, n: usize) -> i64 {
    bytes_out(|| {
        let f = frontiers(&st(p, n))?;
        doc(h)?.frontiers_to_vv(&f).map(|v| v.encode()).ok_or_else(|| "frontiersToVV: frontiers not in the history".into())
    })
}
#[no_mangle]
pub unsafe extern "C" fn zl_doc_checkout(h: i32, p: *const u8, n: usize) -> i64 {
    ok(|| doc(h)?.checkout(&frontiers(&st(p, n))?).or_else(fail))
}
#[no_mangle]
pub extern "C" fn zl_doc_checkout_latest(h: i32) -> i64 {
    ok(|| Ok(doc(h)?.checkout_to_latest()))
}
#[no_mangle]
pub extern "C" fn zl_doc_detached(h: i32) -> i64 {
    guard(|| Ok(doc(h)?.is_detached() as i64))
}
#[no_mangle]
pub extern "C" fn zl_doc_json(h: i32) -> i64 {
    text_out(|| Ok(to_json(&doc(h)?.get_deep_value()).to_string()))
}
/// [[peer, [{lamport, length, peer, counter, deps, timestamp, message}...]]...] like loro-crdt's getAllChanges.
#[no_mangle]
pub extern "C" fn zl_doc_changes(h: i32) -> i64 {
    text_out(|| {
        let d = doc(h)?;
        let mut out = Vec::new();
        for (p, end) in d.oplog_vv().iter() {
            let mut list = Vec::new();
            let mut c = 0;
            while c < *end {
                let Some(m) = d.get_change(ID::new(*p, c)) else { break };
                list.push(json!({"lamport": m.lamport, "length": m.len, "peer": p.to_string(), "counter": m.id.counter,
                    "deps": frontiers_json(&m.deps), "timestamp": m.timestamp, "message": m.message.as_deref()}));
                c = m.id.counter + m.len as i32;
            }
            out.push(json!([p.to_string(), list]));
        }
        Ok(J::Array(out).to_string())
    })
}

// ---- containers, by id
fn map(h: i32, c: &str) -> R<LoroMap> {
    Ok(doc(h)?.get_map(cid(c)?))
}
fn list(h: i32, c: &str) -> R<LoroList> {
    Ok(doc(h)?.get_list(cid(c)?))
}
fn text(h: i32, c: &str) -> R<LoroText> {
    Ok(doc(h)?.get_text(cid(c)?))
}
fn tree(h: i32, c: &str) -> R<LoroTree> {
    Ok(doc(h)?.get_tree(cid(c)?))
}
fn new_container(kind: i32) -> R<Container> {
    Ok(match kind {
        0 => Container::Map(LoroMap::new()),
        1 => Container::List(LoroList::new()),
        2 => Container::Text(LoroText::new()),
        3 => Container::Tree(LoroTree::new()),
        _ => return fail(format!("container kind {kind}")),
    })
}

/// The container's value: deep (toJSON) or shallow (children as "🦜:<id>").
#[no_mangle]
pub unsafe extern "C" fn zl_value(h: i32, c: *const u8, cn: usize, deep: bool) -> i64 {
    text_out(|| {
        let id = cid(&st(c, cn))?;
        let v = match doc(h)?.get_container(id.clone()) {
            Some(Container::Map(m)) => if deep { m.get_deep_value() } else { m.get_value() },
            Some(Container::List(l)) => if deep { l.get_deep_value() } else { l.get_value() },
            Some(Container::Text(t)) => LoroValue::String(t.to_string().into()),
            Some(Container::Tree(t)) => t.get_value_with_meta(),
            Some(Container::MovableList(l)) => if deep { l.get_deep_value() } else { l.get_value() },
            _ => return fail(format!("no container {id}")),
        };
        Ok(to_json(&v).to_string())
    })
}
/// Map size, list length, text length in UTF-16 code units.
#[no_mangle]
pub unsafe extern "C" fn zl_len(h: i32, c: *const u8, cn: usize) -> i64 {
    guard(|| {
        let id = cid(&st(c, cn))?;
        Ok(match doc(h)?.get_container(id.clone()) {
            Some(Container::Map(m)) => m.len(),
            Some(Container::List(l)) => l.len(),
            Some(Container::Text(t)) => t.len_utf16(),
            Some(Container::MovableList(l)) => l.len(),
            Some(Container::Tree(t)) => t.nodes().len(),
            _ => return fail(format!("no container {id}")),
        } as i64)
    })
}

#[no_mangle]
pub unsafe extern "C" fn zl_map_set(h: i32, c: *const u8, cn: usize, k: *const u8, kn: usize, v: *const u8, vn: usize) -> i64 {
    ok(|| map(h, &st(c, cn))?.insert(&st(k, kn), value(&st(v, vn))?).or_else(fail))
}
#[no_mangle]
pub unsafe extern "C" fn zl_map_delete(h: i32, c: *const u8, cn: usize, k: *const u8, kn: usize) -> i64 {
    ok(|| map(h, &st(c, cn))?.delete(&st(k, kn)).or_else(fail))
}
#[no_mangle]
pub unsafe extern "C" fn zl_map_get(h: i32, c: *const u8, cn: usize, k: *const u8, kn: usize) -> i64 {
    text_out(|| Ok(shallow_text(map(h, &st(c, cn))?.get(&st(k, kn)))))
}
#[no_mangle]
pub unsafe extern "C" fn zl_map_keys(h: i32, c: *const u8, cn: usize) -> i64 {
    text_out(|| Ok(J::Array(map(h, &st(c, cn))?.keys().map(|k| J::String(k.to_string())).collect()).to_string()))
}
/// A new child container under the key (kind 0 map, 1 list, 2 text, 3 tree): its id.
#[no_mangle]
pub unsafe extern "C" fn zl_map_set_container(h: i32, c: *const u8, cn: usize, k: *const u8, kn: usize, kind: i32) -> i64 {
    text_out(|| Ok(map(h, &st(c, cn))?.insert_container(&st(k, kn), new_container(kind)?).or_else(fail)?.id().to_string()))
}

#[no_mangle]
pub unsafe extern "C" fn zl_list_insert(h: i32, c: *const u8, cn: usize, pos: u32, v: *const u8, vn: usize) -> i64 {
    ok(|| list(h, &st(c, cn))?.insert(pos as usize, value(&st(v, vn))?).or_else(fail))
}
#[no_mangle]
pub unsafe extern "C" fn zl_list_delete(h: i32, c: *const u8, cn: usize, pos: u32, len: u32) -> i64 {
    ok(|| list(h, &st(c, cn))?.delete(pos as usize, len as usize).or_else(fail))
}
#[no_mangle]
pub unsafe extern "C" fn zl_list_get(h: i32, c: *const u8, cn: usize, pos: u32) -> i64 {
    text_out(|| Ok(shallow_text(list(h, &st(c, cn))?.get(pos as usize))))
}
#[no_mangle]
pub unsafe extern "C" fn zl_list_insert_container(h: i32, c: *const u8, cn: usize, pos: u32, kind: i32) -> i64 {
    text_out(|| Ok(list(h, &st(c, cn))?.insert_container(pos as usize, new_container(kind)?).or_else(fail)?.id().to_string()))
}

// text positions are UTF-16 code units, as in JavaScript and in Zinc strings
#[no_mangle]
pub unsafe extern "C" fn zl_text_insert(h: i32, c: *const u8, cn: usize, pos: u32, s: *const u8, sn: usize) -> i64 {
    ok(|| text(h, &st(c, cn))?.insert_utf16(pos as usize, &st(s, sn)).or_else(fail))
}
#[no_mangle]
pub unsafe extern "C" fn zl_text_delete(h: i32, c: *const u8, cn: usize, pos: u32, len: u32) -> i64 {
    ok(|| text(h, &st(c, cn))?.delete_utf16(pos as usize, len as usize).or_else(fail))
}
#[no_mangle]
pub unsafe extern "C" fn zl_text_mark(h: i32, c: *const u8, cn: usize, start: u32, end: u32, k: *const u8, kn: usize, v: *const u8, vn: usize) -> i64 {
    ok(|| text(h, &st(c, cn))?.mark_utf16(start as usize..end as usize, &st(k, kn), value(&st(v, vn))?).or_else(fail))
}
#[no_mangle]
pub unsafe extern "C" fn zl_text_unmark(h: i32, c: *const u8, cn: usize, start: u32, end: u32, k: *const u8, kn: usize) -> i64 {
    ok(|| text(h, &st(c, cn))?.unmark_utf16(start as usize..end as usize, &st(k, kn)).or_else(fail))
}
#[no_mangle]
pub unsafe extern "C" fn zl_text_delta(h: i32, c: *const u8, cn: usize) -> i64 {
    text_out(|| Ok(delta_json(&text(h, &st(c, cn))?.to_delta()).to_string()))
}

/// A new node under `parent` ("" for a root) at `index` (-1: last): its id.
#[no_mangle]
pub unsafe extern "C" fn zl_tree_create(h: i32, c: *const u8, cn: usize, p: *const u8, pn: usize, index: i32) -> i64 {
    text_out(|| {
        let t = tree(h, &st(c, cn))?;
        let parent = parent_of(&st(p, pn))?;
        let id = if index < 0 { t.create(parent) } else { t.create_at(parent, index as usize) };
        Ok(id.or_else(fail)?.to_string())
    })
}
#[no_mangle]
pub unsafe extern "C" fn zl_tree_move(h: i32, c: *const u8, cn: usize, n: *const u8, nn: usize, p: *const u8, pn: usize, index: i32) -> i64 {
    ok(|| {
        let t = tree(h, &st(c, cn))?;
        let (target, parent) = (tree_id(&st(n, nn))?, parent_of(&st(p, pn))?);
        if index < 0 { t.mov(target, parent) } else { t.mov_to(target, parent, index as usize) }.or_else(fail)
    })
}
#[no_mangle]
pub unsafe extern "C" fn zl_tree_delete(h: i32, c: *const u8, cn: usize, n: *const u8, nn: usize) -> i64 {
    ok(|| tree(h, &st(c, cn))?.delete(tree_id(&st(n, nn))?).or_else(fail))
}
/// The parent's id, "" for a root, "!deleted" for a deleted node; an error for an unknown one.
#[no_mangle]
pub unsafe extern "C" fn zl_tree_parent(h: i32, c: *const u8, cn: usize, n: *const u8, nn: usize) -> i64 {
    text_out(|| {
        let id = tree_id(&st(n, nn))?;
        Ok(match tree(h, &st(c, cn))?.parent(id) {
            Some(TreeParentId::Node(p)) => p.to_string(),
            Some(TreeParentId::Root) => String::new(),
            Some(_) => "!deleted".into(),
            None => return fail(format!("tree node {id} does not exist")),
        })
    })
}
/// The children of `parent` ("" for the roots) as a JSON array of ids, "null" when it has none to list (deleted, unknown).
#[no_mangle]
pub unsafe extern "C" fn zl_tree_children(h: i32, c: *const u8, cn: usize, p: *const u8, pn: usize) -> i64 {
    text_out(|| {
        let ch = tree(h, &st(c, cn))?.children(parent_of(&st(p, pn))?);
        Ok(match ch {
            Some(v) => J::Array(v.iter().map(|t| J::String(t.to_string())).collect()).to_string(),
            None => "null".into(),
        })
    })
}
/// Every node, deleted ones included (as loro-crdt's nodes()).
#[no_mangle]
pub unsafe extern "C" fn zl_tree_nodes(h: i32, c: *const u8, cn: usize) -> i64 {
    text_out(|| Ok(J::Array(tree(h, &st(c, cn))?.nodes().iter().map(|t| J::String(t.to_string())).collect()).to_string()))
}
/// 1 deleted, 0 alive, 2 unknown.
#[no_mangle]
pub unsafe extern "C" fn zl_tree_state(h: i32, c: *const u8, cn: usize, n: *const u8, nn: usize) -> i64 {
    guard(|| {
        let t = tree(h, &st(c, cn))?;
        let id = tree_id(&st(n, nn))?;
        Ok(if !t.contains(id) { 2 } else { t.is_node_deleted(&id).or_else(fail)? as i64 })
    })
}
#[no_mangle]
pub unsafe extern "C" fn zl_tree_meta(h: i32, c: *const u8, cn: usize, n: *const u8, nn: usize) -> i64 {
    text_out(|| Ok(tree(h, &st(c, cn))?.get_meta(tree_id(&st(n, nn))?).or_else(fail)?.id().to_string()))
}
/// The node's index among its siblings, -1 when it has none (deleted).
#[no_mangle]
pub unsafe extern "C" fn zl_tree_index(h: i32, c: *const u8, cn: usize, n: *const u8, nn: usize) -> i64 {
    guard(|| {
        let t = tree(h, &st(c, cn))?;
        let id = tree_id(&st(n, nn))?;
        let Some(p) = t.parent(id) else { return fail(format!("tree node {id} does not exist")) };
        Ok(t.children(p).and_then(|v| v.iter().position(|x| *x == id)).map(|i| i as i64).unwrap_or(-1))
    })
}

// ---- version vectors
#[no_mangle]
pub unsafe extern "C" fn zl_vv_json(p: *const u8, n: usize) -> i64 {
    text_out(|| Ok(vv_json(&VersionVector::decode(by(p, n)).or_else(fail)?).to_string()))
}
/// {"<peer>": counter, ...} to its encoding.
#[no_mangle]
pub unsafe extern "C" fn zl_vv_encode(p: *const u8, n: usize) -> i64 {
    bytes_out(|| {
        let v: J = serde_json::from_str(&st(p, n)).or_else(fail)?;
        let mut vv = VersionVector::new();
        for (k, c) in v.as_object().ok_or("version vector: not an object")? {
            vv.insert(peer(k)?, c.as_i64().ok_or("version vector: not a counter")? as i32);
        }
        Ok(vv.encode())
    })
}

// ---- ephemeral stores (presence)
#[no_mangle]
pub extern "C" fn zl_eph_new(timeout_ms: f64) -> i64 {
    guard(|| {
        let store = EphemeralStore::new(timeout_ms as i64);
        let (events, updates): (Queue<String>, Queue<Vec<u8>>) = Default::default();
        let (ev, up) = (events.clone(), updates.clone());
        let s1 = store.subscribe(Box::new(move |e| {
            let by = match e.by {
                EphemeralEventTrigger::Local => "local",
                EphemeralEventTrigger::Import => "import",
                EphemeralEventTrigger::Timeout => "timeout",
            };
            ev.lock().unwrap().push_back(json!({"by": by, "added": *e.added, "updated": *e.updated, "removed": *e.removed}).to_string());
            true
        }));
        let s2 = store.subscribe_local_updates(Box::new(move |b| {
            up.lock().unwrap().push_back(b.clone());
            true
        }));
        let slot = EphSlot { store, events, updates, _subs: vec![s1, s2] };
        Ok(ST.with(|s| put(&mut s.borrow_mut().ephs, slot)) as i64)
    })
}
#[no_mangle]
pub extern "C" fn zl_eph_free(h: i32) {
    let slot = ST.with(|s| s.borrow_mut().ephs.get_mut(h as usize).and_then(|d| d.take()));
    drop(slot);
}
#[no_mangle]
pub unsafe extern "C" fn zl_eph_set(h: i32, k: *const u8, kn: usize, v: *const u8, vn: usize) -> i64 {
    ok(|| Ok(eph(h)?.set(&st(k, kn), value(&st(v, vn))?)))
}
#[no_mangle]
pub unsafe extern "C" fn zl_eph_delete(h: i32, k: *const u8, kn: usize) -> i64 {
    ok(|| Ok(eph(h)?.delete(&st(k, kn))))
}
#[no_mangle]
pub unsafe extern "C" fn zl_eph_get(h: i32, k: *const u8, kn: usize) -> i64 {
    text_out(|| Ok(eph(h)?.get(&st(k, kn)).map(|v| to_json(&v).to_string()).unwrap_or_default()))
}
#[no_mangle]
pub extern "C" fn zl_eph_all(h: i32) -> i64 {
    text_out(|| Ok(J::Object(eph(h)?.get_all_states().iter().map(|(k, v)| (k.clone(), to_json(v))).collect()).to_string()))
}
/// One key's state encoded, or every state when the key is empty.
#[no_mangle]
pub unsafe extern "C" fn zl_eph_encode(h: i32, k: *const u8, kn: usize) -> i64 {
    bytes_out(|| {
        let e = eph(h)?;
        Ok(if kn == 0 { e.encode_all() } else { e.encode(&st(k, kn)) })
    })
}
#[no_mangle]
pub unsafe extern "C" fn zl_eph_apply(h: i32, p: *const u8, n: usize) -> i64 {
    ok(|| eph(h)?.apply(by(p, n)).or_else(fail))
}
#[no_mangle]
pub extern "C" fn zl_eph_remove_outdated(h: i32) -> i64 {
    ok(|| Ok(eph(h)?.remove_outdated()))
}
#[no_mangle]
pub extern "C" fn zl_eph_events(h: i32) -> i64 {
    text_out(|| {
        eph(h)?;
        Ok(drain_text(&ST.with(|s| s.borrow().ephs[h as usize].as_ref().unwrap().events.clone())))
    })
}
#[no_mangle]
pub extern "C" fn zl_eph_next_update(h: i32) -> i64 {
    bytes_out(|| {
        eph(h)?;
        Ok(drain_one(&ST.with(|s| s.borrow().ephs[h as usize].as_ref().unwrap().updates.clone())))
    })
}
