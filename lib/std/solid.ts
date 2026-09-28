// zinc:ui/solid — Solid's reactive API reimplemented in Zinc strict (D-11, UI-03), plus the helpers the JSX
// lowering calls (_el, _text, _dynText, _show, _for...). Rendering goes through the zinc:ui host ABI.
import * as ui from 'zinc:ui';

interface Source {
  subscribe(c: Computation): void;
  unsubscribe(c: Computation): void;
}
class Computation {
  fn: () => void;
  sources: Source[] = [];
  cleanups: (() => void)[] = [];
  queued: boolean = false;
  /** Computations created while this one ran: disposed when it re-runs or is disposed (Solid ownership). */
  owned: Computation[] = [];
  parent: Computation | null = null;   // the owner whose `owned` list holds this one
  slot: i32 = -1;   // index in `all` while alive
  constructor(fn: () => void) {
    this.fn = fn; this.slot = all.length; all.push(this);
    const o = owner;
    if (o !== null) { o.owned.push(this); this.parent = o; }
  }
}
const NOOP = (): void => {};
let owner: Computation | null = null;
/** An owner for a subtree that outlives the effect creating it (Show branches, For items): owned by `scope` (the
 *  owner where the Show / For sits), so it goes away with it, not when the Show / For effect re-runs. */
function newRoot(scope: Computation | null): Computation { const po = owner; owner = scope; const r = new Computation(NOOP); owner = po; return r; }
function rendered(root: Computation, fn: () => i32): i32 {
  const po = owner, pc = current;
  owner = root; current = null;
  const n = fn();
  owner = po; current = pc;
  return n;
}
/** Disposes everything `c` owns (the list is detached first: children leaving it would disturb the loop). */
function disposeOwned(c: Computation): void {
  const list = c.owned;
  c.owned = [];
  for (const k of list) { k.parent = null; dispose(k); }
}
function dispose(c: Computation): void {
  const p = c.parent;
  if (p !== null) { const i = p.owned.indexOf(c); if (i >= 0) p.owned.splice(i, 1); c.parent = null; }
  disposeOwned(c);
  for (const s of c.sources) s.unsubscribe(c);
  c.sources = [];
  for (const f of c.cleanups) f();
  c.cleanups = [];
  c.fn = NOOP;
  // leave the exit list (swap-remove): a disposed computation holds nothing, and keeping it would grow the heap by
  // every Show branch or list row ever mounted
  if (c.slot >= 0) {
    const last = all.pop();
    if (last !== c) { all[c.slot] = last; last.slot = c.slot; }
    c.slot = -1;
  }
}
/** Live computations, for __dispose at exit. */
const all: Computation[] = [];
/** Breaks the signal <-> computation cycles at exit (called by the runtime before the leak report). */
export function __dispose(): void {
  for (const c of all) { c.fn = NOOP; c.sources = []; c.cleanups = []; }
}
let current: Computation | null = null;
let batchDepth: i32 = 0;
const pending: Computation[] = [];

class SignalState<T> implements Source {
  value: T;
  subs: Computation[] = [];
  constructor(v: T) { this.value = v; }
  subscribe(c: Computation): void { if (this.subs.indexOf(c) < 0) this.subs.push(c); }
  unsubscribe(c: Computation): void { const i = this.subs.indexOf(c); if (i >= 0) this.subs.splice(i, 1); }
}

function track(s: Source): void {
  const c = current;
  if (c === null) return;
  s.subscribe(c);
  c.sources.push(s);
}
function run(c: Computation): void {
  disposeOwned(c);
  for (const s of c.sources) s.unsubscribe(c);
  c.sources = [];
  for (const f of c.cleanups) f();
  c.cleanups = [];
  const prev = current, prevOwner = owner;
  current = c; owner = c;
  c.fn();
  current = prev; owner = prevOwner;
}
function notify(subs: Computation[]): void {
  const list = subs.slice();
  for (const c of list) {
    if (batchDepth > 0) { if (!c.queued) { c.queued = true; pending.push(c); } }
    else run(c);
  }
}

export function createSignal<T>(v: T): [() => T, (v: T) => void] {
  const s = new SignalState<T>(v);
  return [() => { track(s); return s.value; }, (nv: T) => { if (s.value === nv) return; s.value = nv; notify(s.subs); }];
}
export function createEffect(fn: () => void): void {
  const c = new Computation(fn);
  run(c);
  // nothing tracked, nothing owned, no cleanup: it can never run again, so it is not kept (like Solid). JSX makes an
  // effect for every non-literal class or text; the ones that read no signal cost no memory this way.
  if (c.sources.length === 0 && c.owned.length === 0 && c.cleanups.length === 0) dispose(c);
}
export function createMemo<T>(fn: () => T, init: T): () => T {
  const s = new SignalState<T>(init);
  createEffect(() => { const v = fn(); if (v !== s.value) { s.value = v; notify(s.subs); } });
  return () => { track(s); return s.value; };
}
export function createRoot<T>(fn: () => T): T { return fn(); }
export function untrack<T>(fn: () => T): T {
  const prev = current;
  current = null;
  const r = fn();
  current = prev;
  return r;
}
export function batch(fn: () => void): void {
  batchDepth++;
  fn();
  batchDepth--;
  if (batchDepth === 0) {
    while (pending.length > 0) {
      const c = pending.shift();
      c.queued = false;
      run(c);
    }
  }
}
export function onCleanup(fn: () => void): void { const c = current; if (c !== null) c.cleanups.push(fn); }
export function onMount(fn: () => void): void { queueMicrotask(fn); }

// ---- JSX lowering helpers (called by compiler-generated code) ----
export function _el(tag: i32): i32 { return ui.createNode(tag); }
export function _img(n: i32, src: string): void { ui.setImage(n, src); }
export function _dynImg(n: i32, get: () => string): void { createEffect(() => { ui.setImage(n, get()); }); }
export function _focusable(n: i32): void { ui.setFocusable(n, true); }
export function _ref(n: i32, r: NodeRef): void { r.node = n; }

/** Handle to a mounted node (ref={...}), used by animate(). */
export class NodeRef { node: i32 = -1; }
export function createNodeRef(): NodeRef { return new NodeRef(); }
export interface AnimateOptions { dur?: i32; easing?: string; delay?: i32 }
/** Engine-driven tween (UI-17): no reactive work per frame. Properties: width, height, opacity, translateX, translateY. */
export function animate(ref: NodeRef, prop: string, to: number, opts: AnimateOptions): Promise<void> {
  return ui.animate(ref.node, prop, to, opts.dur ?? 300, opts.easing ?? 'out', opts.delay ?? 0);
}
/** Resolves after `ms` milliseconds. */
export function after(ms: number): Promise<void> { return new Promise<void>(resolve => { setTimeout(resolve, ms); }); }
export function _text(parent: i32, s: string): void { ui.insert(parent, ui.createText(s), -1); }
export function _textOf(n: i32, s: string): void { ui.setText(n, s); }
export function _dynTextOf(n: i32, get: () => string): void { createEffect(() => { ui.setText(n, get()); }); }
export function _append(parent: i32, child: i32): void { ui.insert(parent, child, -1); }
export function _class(n: i32, c: string): void { ui.setClass(n, c); }
export function _on(n: i32, f: () => void): void { ui.listen(n, f); }
export function _draw(n: i32, f: (x: i32, y: i32, w: i32, h: i32) => void): void { ui.draw(n, f); }
export function _num(n: i32, key: string, v: number): void { ui.setNumber(n, key, v); }
export function _dynText(parent: i32, get: () => string): void {
  const t = ui.createText('');
  ui.insert(parent, t, -1);
  createEffect(() => { ui.setText(t, get()); });
}
export function _dynClass(n: i32, get: () => string): void { createEffect(() => { ui.setClass(n, get()); }); }
export function _dynNum(n: i32, key: string, get: () => number): void { createEffect(() => { ui.setNumber(n, key, get()); }); }
// text fields and pointer / key events
export function _ptr(n: i32, kind: i32, f: (e: ui.PointerEvent) => void): void { ui.onPointer(n, kind, f); }
export function _key(n: i32, f: (e: ui.KeyEvent) => void): void { ui.onKeyDown(n, f); }
export function _onText(n: i32, change: boolean, f: (v: string) => void): void { ui.onText(n, change, f); }
export function _str(n: i32, key: string, s: string): void { if (key === 'value') ui.setValue(n, s); else ui.setPlaceholder(n, s); }
export function _dynStr(n: i32, key: string, get: () => string): void { createEffect(() => { _str(n, key, get()); }); }
export function _hl(n: i32, f: (line: string) => i32[]): void { ui.setHighlight(n, f); }
/** <Show when={...} fallback={...}>children</Show> */
export function _show(parent: i32, when: () => boolean, render: () => i32, fallback: (() => i32) | null): void {
  const frag = ui.createNode(ui.FRAGMENT);
  ui.insert(parent, frag, -1);
  let shown: i32 = -1;
  let root: Computation | null = null;
  const scope = owner;
  createEffect(() => {
    const w = when();
    const next: i32 = w ? 1 : 0;
    if (next === shown) return;
    shown = next;
    if (root !== null) dispose(root);
    ui.clearChildren(frag);
    const r = newRoot(scope);
    root = r;
    if (w) ui.insert(frag, rendered(r, render), -1);
    else if (fallback !== null) ui.insert(frag, rendered(r, fallback), -1);
  });
}
/** <For each={...}>{(item, i) => ...}</For> — ponytail: re-renders the list on change (unkeyed). */
/** <For each={...}>: keyed by item identity like Solid's mapArray — kept items keep their nodes and effects, new
 *  items render once, removed items are disposed, moves reorder nodes. ponytail: O(n·m) matching, fine for UI lists. */
export function _for<T>(parent: i32, each: () => T[], render: (item: T, i: i32) => i32): void {
  const frag = ui.createNode(ui.FRAGMENT);
  ui.insert(parent, frag, -1);
  let keys: T[] = [];
  let nodes: i32[] = [];
  let roots: Computation[] = [];
  const scope = owner;
  createEffect(() => {
    const items = each();
    const used: boolean[] = [];
    for (let k = 0; k < keys.length; k++) used.push(false);
    const nk: T[] = [], nn: i32[] = [], nr: Computation[] = [];
    for (let i = 0; i < items.length; i++) {
      let j = -1;
      for (let k = 0; k < keys.length; k++) if (!used[k] && keys[k] === items[i]) { j = k; break; }
      if (j >= 0) { used[j] = true; nk.push(keys[j]); nn.push(nodes[j]); nr.push(roots[j]); continue; }
      // a new item renders under its own root, not owned by this effect (which re-runs on every change)
      const root = newRoot(scope);
      const item = items[i];
      nk.push(item); nn.push(rendered(root, () => render(item, i))); nr.push(root);
    }
    for (let k = 0; k < keys.length; k++) if (!used[k]) { dispose(roots[k]); ui.remove(frag, nodes[k]); }
    ui.detachChildren(frag);
    for (const n of nn) ui.insert(frag, n, -1);
    keys = nk; nodes = nn; roots = nr;
  });
}
/** <VirtualList count={n} itemHeight={h}>{(i) => <row/>}</VirtualList>: only visible rows exist (keyed by index). */
export function _virtual(n: i32, count: () => i32, itemH: number, render: (i: i32) => i32): void {
  const roots = new Map<i32, Computation>();  // row node -> its reactive root
  const scope = owner;
  createEffect(() => {
    const c = count();
    // each row renders under its own root, disposed when the row scrolls out or the count changes
    untrack(() => {
      ui.virtualize(n, c, itemH, (i: i32) => { const r = newRoot(scope); const row = rendered(r, () => render(i)); roots.set(row, r); return row; },
        (row: i32) => { const r = roots.get(row); if (r !== undefined) { dispose(r); roots.delete(row); } });
      return 0;
    });
  });
}
/** Mounts the app on the screen; `onTick` runs every frame (games put their update there). */
export function render(app: () => i32, background: i32, onTick: ((dt: number) => void) | null): void {
  const root = ui.createNode(ui.VIEW);
  ui.insert(root, app(), -1);
  ui.mount(root, background, onTick);
}
/** Markers for `import { Show, For } from 'zinc:ui/solid'`: the JSX lowering compiles these tags itself. */
export const Show: i32 = 0, For: i32 = 1;
/** Marker for `<VirtualList count itemHeight>{(i) => ...}</VirtualList>` (lowered by the JSX compiler). */
export const VirtualList: i32 = 2;
