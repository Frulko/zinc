// zinc:loro, also importable as 'loro-crdt': the Loro CRDT (docs/plugins/loro.md) with the API of the loro-crdt package, so code
// written for it compiles here and its documents travel to Loro's other clients (browser, Swift, Rust) byte for byte.
// The CRDT is the Rust crate `loro` (MIT), built by cargo into the plugin. Values (loro-crdt's Value: any JSON) are `unknown`,
// a Dyn of the gradual profile: values, toDelta() parts and event diffs are not typed further here. In this file `undefined`
// as a value is the Dyn one: a typed `T | undefined` result comes from none() (none.ts).
import N from './native/loro.spec';
import { none } from './none';

/** Bytes. Zinc has no typed arrays: a u8[] (a real Uint8Array on the QuickJS engine). */
export type Uint8Array = u8[];
export type PeerID = string;
export type TreeID = string;
export type ContainerID = string;

export class LoroError extends Error {
  constructor(message: string) { super(message); this.name = 'LoroError'; }
}
function check(): void { if (N.failed()) throw new LoroError(N.error()); }
function str(s: string): string { check(); return s; }
function bin(b: u8[]): u8[] { check(); return b; }

/** One operation's id; an array of them is a version (frontiers). */
export interface OpId { peer: PeerID; counter: number }
export type Frontiers = OpId[];
function frontiersText(f: OpId[]): string { return f.map((o: OpId) => `${o.counter}@${o.peer}`).join(','); }
function frontiersOf(t: string): OpId[] {
  const out: OpId[] = [];
  if (t !== '') for (const id of t.split(',')) { const at = id.indexOf('@'); out.push({ peer: id.slice(at + 1), counter: parseInt(id.slice(0, at)) }); }
  return out;
}
function strings(json: string): string[] {
  const out: string[] = [];
  if (json === 'null') return out;
  for (const v of JSON.parse(json)) { const s: string = v; out.push(s); }
  return out;
}

/** A version vector: for each peer, how many of its operations are included. */
export class VersionVector {
  private b: u8[];
  constructor(entries?: Map<PeerID, number>) {
    let o = '{';
    if (entries !== undefined) entries.forEach((c: number, p: PeerID) => { o += (o.length > 1 ? ',' : '') + JSON.stringify(p) + ':' + `${c}`; });
    this.b = bin(N.vvEncode(o + '}'));
  }
  static decode(bytes: u8[]): VersionVector { N.vvJSON(bytes); check(); const v = new VersionVector(); v.b = bytes.slice(); return v; }
  /** @internal */
  static of(bytes: u8[]): VersionVector { const v = new VersionVector(); v.b = bytes; return v; }
  encode(): u8[] { return this.b.slice(); }
  toJSON(): Map<PeerID, number> {
    const m = new Map<PeerID, number>();
    for (const pair of JSON.parse(str(N.vvJSON(this.b)))) { const p: string = pair[0]; const c: number = pair[1]; m.set(p, c); }
    return m;
  }
  get(peer: PeerID): number | undefined { return this.toJSON().get(peer); }
  length(): number { return this.toJSON().size; }
}

// ---- events
export class LoroEvent {
  /** The container that changed. */
  readonly target: ContainerID;
  /** { type: 'map' | 'list' | 'text' | 'tree', ... } as loro-crdt shapes it; a child container in it is its deep value. */
  readonly diff: unknown;
  /** From the root container's name down to the target: keys, list indexes and tree node ids. */
  readonly path: unknown[];
  constructor(target: ContainerID, diff: unknown, path: unknown[]) { this.target = target; this.diff = diff; this.path = path; }
}
export class LoroEventBatch {
  /** 'local', 'import' or 'checkout'. */
  readonly by: string;
  readonly origin: string;
  readonly currentTarget: ContainerID | undefined;
  readonly events: LoroEvent[];
  constructor(by: string, origin: string, currentTarget: ContainerID | undefined, events: LoroEvent[]) {
    this.by = by; this.origin = origin; this.currentTarget = currentTarget; this.events = events;
  }
}
function batches(json: string): LoroEventBatch[] {
  const out: LoroEventBatch[] = [];
  for (const b of JSON.parse(json)) {
    const events: LoroEvent[] = [];
    for (const e of b.events) {
      const path: unknown[] = [];
      for (const p of e.path) path.push(p);
      const target: string = e.target;
      events.push(new LoroEvent(target, e.diff, path));
    }
    const by: string = b.by;
    const origin: string = b.origin;
    const ct = b.currentTarget;
    out.push(new LoroEventBatch(by, origin, typeof ct === 'string' ? ct : none<string>(), events));
  }
  return out;
}

/** One change of the history, as getAllChanges lists them. */
export interface Change {
  lamport: number; length: number; peer: PeerID; counter: number;
  /** Seconds since the epoch; 0 unless the document records timestamps. */
  timestamp: number;
  message: string | undefined;
  deps: OpId[];
}
export interface CommitOptions { origin?: string; message?: string; timestamp?: number }
export interface ExportOptions { mode: string; from?: VersionVector }
export interface TextRange { start: number; end: number }
export interface ImportStatus { pending: Map<PeerID, number> | undefined }

type Listener = (e: LoroEventBatch) => void;
type UpdateListener = (bytes: u8[]) => void;

export class LoroDoc {
  private h: i32;
  private subs = new Map<i32, Listener>();
  private updateSubs = new Map<i32, UpdateListener>();
  private nextSub: i32 = 0;
  private listening: i32 = 0;
  constructor() { this.h = N.docNew(); check(); }
  static fromSnapshot(bytes: u8[]): LoroDoc { const d = new LoroDoc(); d.import(bytes); return d; }
  /** @internal: the native handle. */
  handle(): i32 { if (this.h < 0) throw new LoroError('the document is freed'); return this.h; }
  /** Releases the native document (Zinc frees no native memory on its own). */
  free(): void { if (this.h >= 0) N.docFree(this.h); this.h = -1; }

  /** The peer id as a decimal string (loro-crdt's peerIdStr). */
  get peerIdStr(): PeerID { return str(N.peerId(this.handle())); }
  /** The peer id as a number: exact below 2^53 only (loro-crdt returns a bigint). */
  get peerId(): number { return parseFloat(this.peerIdStr); }
  /** A number (exact below 2^53); setPeerIdStr takes any u64 as its decimal string. */
  setPeerId(peer: number): void { this.setPeerIdStr(`${peer}`); }
  setPeerIdStr(peer: PeerID): void { N.setPeerId(this.handle(), peer); check(); }
  setRecordTimestamp(on: boolean): void { N.recordTimestamp(this.handle(), on); check(); }
  /** { bold: { expand: 'after' }, link: { expand: 'none' } }: how each mark grows when text is typed at its edges. */
  configTextStyle(styles: unknown): void { N.textStyle(this.handle(), JSON.stringify(styles)); check(); }

  commit(options?: CommitOptions): void {
    const o: CommitOptions = options ?? {};
    N.commit(this.handle(), o.message ?? '', o.origin ?? '', o.timestamp ?? NaN);
    check();
    this.flush();
  }
  getMap(name: string): LoroMap { const m = new LoroMap(); m.attach(this, `cid:root-${name}:Map`); return m; }
  getList(name: string): LoroList { const l = new LoroList(); l.attach(this, `cid:root-${name}:List`); return l; }
  getText(name: string): LoroText { const t = new LoroText(); t.attach(this, `cid:root-${name}:Text`); return t; }
  getTree(name: string): LoroTree { const t = new LoroTree(); t.attach(this, `cid:root-${name}:Tree`); return t; }

  /** { mode: 'snapshot' } or { mode: 'update', from?: VersionVector } (everything when from is absent). */
  export(options: ExportOptions): u8[] {
    let r: u8[];
    if (options.mode === 'snapshot') r = N.exportDoc(this.handle(), 0, []);
    else if (options.mode === 'update') { const f = options.from; r = N.exportDoc(this.handle(), 1, f === undefined ? [] : f.encode()); }
    else throw new LoroError(`export mode '${options.mode}' is not supported here ('snapshot' or 'update')`);
    check();
    this.flush();
    return r;
  }
  import(bytes: u8[]): ImportStatus {
    const t = str(N.importDoc(this.handle(), bytes));
    this.flush();
    const pending = JSON.parse(t).pending;
    if (pending === null) return { pending: none<Map<PeerID, number>>() };
    const m = new Map<PeerID, number>();
    for (const pair of pending) { const p: string = pair[0]; const c: number = pair[1]; m.set(p, c); }
    return { pending: m };
  }
  /** The version of the current state (moves with checkout). */
  frontiers(): OpId[] { return frontiersOf(str(N.frontiers(this.handle()))); }
  /** The latest version of the history. */
  oplogFrontiers(): OpId[] { return frontiersOf(str(N.oplogFrontiers(this.handle()))); }
  version(): VersionVector { return VersionVector.of(bin(N.versionOf(this.handle(), false))); }
  oplogVersion(): VersionVector { return VersionVector.of(bin(N.versionOf(this.handle(), true))); }
  frontiersToVV(frontiers: OpId[]): VersionVector { return VersionVector.of(bin(N.frontiersToVV(this.handle(), frontiersText(frontiers)))); }
  checkout(frontiers: OpId[]): void { N.checkout(this.handle(), frontiersText(frontiers)); check(); this.flush(); }
  checkoutToLatest(): void { N.checkoutLatest(this.handle()); check(); this.flush(); }
  isDetached(): boolean { const r = N.detached(this.handle()); check(); return r; }
  toJSON(): unknown { return JSON.parse(str(N.toJSON(this.handle()))); }
  getAllChanges(): Map<PeerID, Change[]> {
    const m = new Map<PeerID, Change[]>();
    for (const pair of JSON.parse(str(N.changes(this.handle())))) {
      const list: Change[] = [];
      for (const c of pair[1]) {
        const deps: OpId[] = [];
        for (const d of c.deps) { const p: string = d.peer; const n: number = d.counter; deps.push({ peer: p, counter: n }); }
        const msg = c.message;
        const peer: string = c.peer;
        const lamport: number = c.lamport; const length: number = c.length; const counter: number = c.counter; const ts: number = c.timestamp;
        list.push({ lamport: lamport, length: length, peer: peer, counter: counter, timestamp: ts, message: typeof msg === 'string' ? msg : none<string>(), deps: deps });
      }
      const peer: string = pair[0];
      m.set(peer, list);
    }
    return m;
  }

  /** Calls `listener` with every batch of changes: local commits, imports, checkouts. Returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listen(1);
    const id = this.nextSub++;
    this.subs.set(id, listener);
    return () => { this.subs.delete(id); };
  }
  /** Calls `listener` with the update bytes of every local commit, ready to send to peers. */
  subscribeLocalUpdates(listener: UpdateListener): () => void {
    this.listen(2);
    const id = this.nextSub++;
    this.updateSubs.set(id, listener);
    return () => { this.updateSubs.delete(id); };
  }
  private listen(what: i32): void {
    if ((this.listening & what) !== 0) return;
    N.listen(this.handle(), what);
    check();
    this.listening |= what;
  }
  /** Delivers what the native side queued during the last call, as loro-crdt does: synchronously, before that call returns. */
  private flush(): void {
    if ((this.listening & 1) !== 0) {
      const t = N.events(this.h);
      if (t !== '') for (const b of batches(t)) this.subs.forEach((l: Listener) => l(b));
    }
    if ((this.listening & 2) !== 0) {
      for (;;) {
        const u = N.nextUpdate(this.h);
        if (u.length === 0) break;
        this.updateSubs.forEach((l: UpdateListener) => l(u));
      }
    }
  }
}

// ---- containers
/** What every container shares. A container made with `new` is detached until setContainer / insertContainer attaches it. */
export abstract class Container {
  protected owner: LoroDoc | null = null;
  protected cid: ContainerID = '';
  /** 0 map, 1 list, 2 text, 3 tree. */
  abstract kind(): i32;
  /** @internal */
  attach(doc: LoroDoc, id: ContainerID): void { this.owner = doc; this.cid = id; }
  get id(): ContainerID { return this.cid; }
  isAttached(): boolean { return this.owner !== null; }
  protected doc(): LoroDoc {
    const d = this.owner;
    if (d === null) throw new LoroError('this container is detached: attach it with setContainer or insertContainer first');
    return d;
  }
  protected h(): i32 { return this.doc().handle(); }
  toJSON(): unknown { return JSON.parse(str(N.value(this.h(), this.cid, true))); }
}
/** The container object of an id, as a Dyn that keeps its class (instanceof LoroMap...). */
function containerOf(doc: LoroDoc, id: ContainerID): unknown {
  if (id.endsWith(':Map')) { const m = new LoroMap(); m.attach(doc, id); const r: unknown = m; return r; }
  if (id.endsWith(':Text')) { const t = new LoroText(); t.attach(doc, id); const r: unknown = t; return r; }
  if (id.endsWith(':Tree')) { const t = new LoroTree(); t.attach(doc, id); const r: unknown = t; return r; }
  const l = new LoroList();   // ponytail: a MovableList or a Counter is read as a list
  l.attach(doc, id);
  const r: unknown = l;
  return r;
}
/** A value as JSON text, undefined for '', a child container for loro's "🦜:<id>". */
function valueOf(doc: LoroDoc, t: string): unknown {
  if (t === '') return undefined;
  const v = JSON.parse(t);
  if (typeof v === 'string' && v.startsWith('🦜:')) return containerOf(doc, v.slice(3));
  return v;
}

export class LoroMap extends Container {
  kind(): i32 { return 0; }
  get(key: string): unknown { return valueOf(this.doc(), str(N.mapGet(this.h(), this.cid, key))); }
  set(key: string, value: unknown): void { N.mapSet(this.h(), this.cid, key, JSON.stringify(value)); check(); }
  delete(key: string): void { N.mapDelete(this.h(), this.cid, key); check(); }
  keys(): string[] { return strings(str(N.mapKeys(this.h(), this.cid))); }
  values(): unknown[] { return this.keys().map((k: string) => this.get(k)); }
  entries(): [string, unknown][] { return this.keys().map((k: string): [string, unknown] => [k, this.get(k)]); }
  get size(): number { const n = N.len(this.h(), this.cid); check(); return n; }
  clear(): void { for (const k of this.keys()) this.delete(k); }
  /** Puts a new container under `key` and returns it, attached: `child` itself (typed Container, the engine has no generic methods yet). */
  setContainer(key: string, child: Container): Container {
    const id = str(N.mapSetContainer(this.h(), this.cid, key, child.kind()));
    child.attach(this.doc(), id);
    return child;
  }
  getOrCreateContainer(key: string, child: Container): Container {
    const v = this.get(key);
    if (v instanceof Container && v.kind() === child.kind()) { child.attach(this.doc(), v.id); return child; }
    return this.setContainer(key, child);
  }
}

export class LoroList extends Container {
  kind(): i32 { return 1; }
  get length(): number { const n = N.len(this.h(), this.cid); check(); return n; }
  insert(index: number, value: unknown): void { N.listInsert(this.h(), this.cid, index as i32, JSON.stringify(value)); check(); }
  push(value: unknown): void { this.insert(this.length, value); }
  delete(index: number, len: number): void { N.listDelete(this.h(), this.cid, index as i32, len as i32); check(); }
  get(index: number): unknown { return valueOf(this.doc(), str(N.listGet(this.h(), this.cid, index as i32))); }
  insertContainer(index: number, child: Container): Container {
    const id = str(N.listInsertContainer(this.h(), this.cid, index as i32, child.kind()));
    child.attach(this.doc(), id);
    return child;
  }
  pushContainer(child: Container): Container { return this.insertContainer(this.length, child); }
  /** The elements, child containers as container objects. */
  toArray(): unknown[] {
    const out: unknown[] = [];
    const d = this.doc();
    for (const v of JSON.parse(str(N.value(this.h(), this.cid, false)))) {
      out.push(typeof v === 'string' && v.startsWith('🦜:') ? containerOf(d, v.slice(3)) : v);
    }
    return out;
  }
  clear(): void { const n = this.length; if (n > 0) this.delete(0, n); }
}

export class LoroText extends Container {
  kind(): i32 { return 2; }
  /** Positions and lengths are UTF-16 code units, as in JavaScript. */
  insert(index: number, content: string): void { N.textInsert(this.h(), this.cid, index as i32, content); check(); }
  delete(index: number, len: number): void { N.textDelete(this.h(), this.cid, index as i32, len as i32); check(); }
  mark(range: TextRange, key: string, value: unknown): void { N.textMark(this.h(), this.cid, range.start as i32, range.end as i32, key, JSON.stringify(value)); check(); }
  unmark(range: TextRange, key: string): void { N.textUnmark(this.h(), this.cid, range.start as i32, range.end as i32, key); check(); }
  toString(): string { const s: string = JSON.parse(str(N.value(this.h(), this.cid, true))); return s; }
  /** Quill-style parts: { insert, attributes? } (and retain / delete in events). */
  toDelta(): unknown[] { const out: unknown[] = []; for (const p of JSON.parse(str(N.textDelta(this.h(), this.cid)))) out.push(p); return out; }
  get length(): number { const n = N.len(this.h(), this.cid); check(); return n; }
}

export class LoroTree extends Container {
  kind(): i32 { return 3; }
  /** A node under `parent` (a root when absent) at `index` (last when absent). */
  createNode(parent?: TreeID, index?: number): LoroTreeNode {
    return new LoroTreeNode(this, str(N.treeCreate(this.h(), this.cid, parent ?? '', index === undefined ? -1 : index as i32)));
  }
  move(target: TreeID, parent?: TreeID, index?: number): void {
    N.treeMove(this.h(), this.cid, target, parent ?? '', index === undefined ? -1 : index as i32);
    check();
  }
  delete(target: TreeID): void { N.treeDelete(this.h(), this.cid, target); check(); }
  has(target: TreeID): boolean { return this.state(target) !== 2; }
  isNodeDeleted(target: TreeID): boolean {
    const s = this.state(target);
    if (s === 2) throw new LoroError(`tree node ${target} does not exist`);
    return s === 1;
  }
  getNodeByID(target: TreeID): LoroTreeNode | undefined { return this.has(target) ? new LoroTreeNode(this, target) : none<LoroTreeNode>(); }
  /** Every node, deleted ones included. */
  nodes(): LoroTreeNode[] { return strings(str(N.treeNodes(this.h(), this.cid))).map((id: string) => new LoroTreeNode(this, id)); }
  roots(): LoroTreeNode[] { return this.childrenOf(''); }
  /** @internal */
  childrenOf(parent: TreeID): LoroTreeNode[] { return strings(str(N.treeChildren(this.h(), this.cid, parent))).map((id: string) => new LoroTreeNode(this, id)); }
  /** @internal */
  parentOf(node: TreeID): string { return str(N.treeParent(this.h(), this.cid, node)); }
  /** @internal */
  metaOf(node: TreeID): LoroMap { const m = new LoroMap(); m.attach(this.doc(), str(N.treeMeta(this.h(), this.cid, node))); return m; }
  /** @internal */
  indexOf(node: TreeID): number { const i = N.treeIndex(this.h(), this.cid, node); check(); return i; }
  private state(target: TreeID): i32 { const s = N.treeState(this.h(), this.cid, target); check(); return s; }
}

export class LoroTreeNode {
  readonly tree: LoroTree;
  readonly id: TreeID;
  constructor(tree: LoroTree, id: TreeID) { this.tree = tree; this.id = id; }
  /** The node's own map, for its fields. */
  get data(): LoroMap { return this.tree.metaOf(this.id); }
  createNode(index?: number): LoroTreeNode { return this.tree.createNode(this.id, index); }
  /** Moves the node under `parent` (a root when absent), at `index` (last when absent). */
  move(parent?: LoroTreeNode, index?: number): void { this.tree.move(this.id, parent === undefined ? none<string>() : parent.id, index); }
  /** The parent node; undefined for a root and for a deleted node. */
  parent(): LoroTreeNode | undefined {
    const p = this.tree.parentOf(this.id);
    return p === '' || p === '!deleted' ? none<LoroTreeNode>() : new LoroTreeNode(this.tree, p);
  }
  /** The children in order; undefined for a deleted node. */
  children(): LoroTreeNode[] | undefined { return this.isDeleted() ? none<LoroTreeNode[]>() : this.tree.childrenOf(this.id); }
  index(): number | undefined { const i = this.tree.indexOf(this.id); return i < 0 ? none<number>() : i; }
  isDeleted(): boolean { return this.tree.isNodeDeleted(this.id); }
}

// ---- presence: ephemeral key-value states that expire
export class EphemeralStoreEvent {
  readonly by: string;
  readonly added: string[];
  readonly updated: string[];
  readonly removed: string[];
  constructor(by: string, added: string[], updated: string[], removed: string[]) { this.by = by; this.added = added; this.updated = updated; this.removed = removed; }
}
type EphemeralListener = (e: EphemeralStoreEvent) => void;

export class EphemeralStore {
  private h: i32;
  private subs = new Map<i32, EphemeralListener>();
  private updateSubs = new Map<i32, UpdateListener>();
  private nextSub: i32 = 0;
  /** timeout: milliseconds without an update after which a key expires (removeOutdated drops it). */
  constructor(timeout?: number) { this.h = N.ephNew(timeout ?? 30000); check(); }
  free(): void { if (this.h >= 0) N.ephFree(this.h); this.h = -1; }
  set(key: string, value: unknown): void { N.ephSet(this.h, key, JSON.stringify(value)); check(); this.flush(); }
  delete(key: string): void { N.ephDelete(this.h, key); check(); this.flush(); }
  get(key: string): unknown { const t = str(N.ephGet(this.h, key)); return t === '' ? undefined : JSON.parse(t); }
  getAllStates(): unknown { return JSON.parse(str(N.ephAll(this.h))); }
  keys(): string[] {
    const out: string[] = [];
    const all = str(N.ephAll(this.h));
    for (const k in JSON.parse(all)) out.push(k);
    return out;
  }
  encode(key: string): u8[] { return bin(N.ephEncode(this.h, key)); }
  encodeAll(): u8[] { return bin(N.ephEncode(this.h, '')); }
  apply(bytes: u8[]): void { N.ephApply(this.h, bytes); check(); this.flush(); }
  removeOutdated(): void { N.ephRemoveOutdated(this.h); check(); this.flush(); }
  subscribe(listener: EphemeralListener): () => void {
    const id = this.nextSub++;
    this.subs.set(id, listener);
    return () => { this.subs.delete(id); };
  }
  subscribeLocalUpdates(listener: UpdateListener): () => void {
    const id = this.nextSub++;
    this.updateSubs.set(id, listener);
    return () => { this.updateSubs.delete(id); };
  }
  private flush(): void {
    const t = N.ephEvents(this.h);
    if (t !== '') for (const e of JSON.parse(t)) {
      const by: string = e.by;
      const ev = new EphemeralStoreEvent(by, strings(JSON.stringify(e.added)), strings(JSON.stringify(e.updated)), strings(JSON.stringify(e.removed)));
      this.subs.forEach((l: EphemeralListener) => l(ev));
    }
    for (;;) {
      const u = N.ephNextUpdate(this.h);
      if (u.length === 0) break;
      this.updateSubs.forEach((l: UpdateListener) => l(u));
    }
  }
}
