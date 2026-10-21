// zinc:loro native side: the Loro CRDT (the Rust crate `loro`, built by cargo from plugins/loro/rust) over integer handles.
// Documents and ephemeral stores are handles; containers are named by their container id ("cid:root-blocks:Tree"). Values
// cross as JSON text, a child container inside one as "🦜:<container id>". A call that fails sets failed() and error();
// plugins/loro/index.ts checks it and throws. Frontiers cross as "counter@peer" ids joined with ','.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The version of the crate: '1.16.2'. */
  version(): string;
  /** Whether the last call failed, and why. */
  failed(): boolean;
  error(): string;

  // ---- documents
  docNew(): i32;
  docFree(d: i32): void;
  /** Starts queueing the document's events (what 1) or its local updates (what 2). */
  listen(d: i32, what: i32): void;
  /** The events queued since the last call, as a JSON array of loro-crdt event batches; '' when none. */
  events(d: i32): string;
  /** The oldest queued local update; [] when none. */
  nextUpdate(d: i32): u8[];
  peerId(d: i32): string;
  setPeerId(d: i32, peer: string): void;
  /** message and origin may be ''; timestamp in seconds, NaN for the clock. */
  commit(d: i32, message: string, origin: string, timestamp: f64): void;
  recordTimestamp(d: i32, on: boolean): void;
  /** JSON: { "<mark>": { "expand": "before" | "after" | "both" | "none" } } */
  textStyle(d: i32, json: string): void;
  /** mode 0 snapshot, 1 updates since the encoded version vector `from` (all of them when empty). */
  exportDoc(d: i32, mode: i32, from: u8[]): u8[];
  /** JSON { pending: null | [["<peer>", counter], ...] }. */
  importDoc(d: i32, bytes: u8[]): string;
  frontiers(d: i32): string;
  oplogFrontiers(d: i32): string;
  /** The version vector of the current state, or of the whole history (oplog), encoded. */
  versionOf(d: i32, oplog: boolean): u8[];
  frontiersToVV(d: i32, frontiers: string): u8[];
  checkout(d: i32, frontiers: string): void;
  checkoutLatest(d: i32): void;
  detached(d: i32): boolean;
  /** The document's deep value as JSON. */
  toJSON(d: i32): string;
  /** getAllChanges as JSON: [[peer, [{ lamport, length, peer, counter, deps, timestamp, message }]]]. */
  changes(d: i32): string;

  // ---- containers
  /** The container's value as JSON, deep (children as values) or shallow (children as "🦜:<id>"). */
  value(d: i32, cid: string, deep: boolean): string;
  /** Map size, list length, text length in UTF-16 code units, tree node count. */
  len(d: i32, cid: string): i32;
  mapSet(d: i32, cid: string, key: string, json: string): void;
  mapDelete(d: i32, cid: string, key: string): void;
  /** JSON of the value ('' when the key is absent). */
  mapGet(d: i32, cid: string, key: string): string;
  /** JSON array of the keys. */
  mapKeys(d: i32, cid: string): string;
  /** kind 0 map, 1 list, 2 text, 3 tree: the new child's id. */
  mapSetContainer(d: i32, cid: string, key: string, kind: i32): string;
  listInsert(d: i32, cid: string, pos: i32, json: string): void;
  listDelete(d: i32, cid: string, pos: i32, len: i32): void;
  listGet(d: i32, cid: string, pos: i32): string;
  listInsertContainer(d: i32, cid: string, pos: i32, kind: i32): string;
  /** Positions in UTF-16 code units. */
  textInsert(d: i32, cid: string, pos: i32, text: string): void;
  textDelete(d: i32, cid: string, pos: i32, len: i32): void;
  textMark(d: i32, cid: string, start: i32, end: i32, key: string, json: string): void;
  textUnmark(d: i32, cid: string, start: i32, end: i32, key: string): void;
  /** Quill-style delta as JSON. */
  textDelta(d: i32, cid: string): string;
  /** parent '' for a root, index -1 for last: the new node's id. */
  treeCreate(d: i32, cid: string, parent: string, index: i32): string;
  treeMove(d: i32, cid: string, node: string, parent: string, index: i32): void;
  treeDelete(d: i32, cid: string, node: string): void;
  /** The parent's id, '' for a root, '!deleted' for a deleted node. */
  treeParent(d: i32, cid: string, node: string): string;
  /** JSON array of ids, 'null' when the parent has no children list (deleted). */
  treeChildren(d: i32, cid: string, parent: string): string;
  /** JSON array of every node's id, deleted ones included. */
  treeNodes(d: i32, cid: string): string;
  /** 0 alive, 1 deleted, 2 unknown. */
  treeState(d: i32, cid: string, node: string): i32;
  /** The id of the node's data map. */
  treeMeta(d: i32, cid: string, node: string): string;
  treeIndex(d: i32, cid: string, node: string): i32;

  // ---- version vectors
  /** JSON [["<peer>", counter], ...]. */
  vvJSON(bytes: u8[]): string;
  vvEncode(json: string): u8[];

  // ---- ephemeral stores
  ephNew(timeoutMs: f64): i32;
  ephFree(h: i32): void;
  ephSet(h: i32, key: string, json: string): void;
  ephDelete(h: i32, key: string): void;
  ephGet(h: i32, key: string): string;
  ephAll(h: i32): string;
  /** One key's state, or all of them when key is ''. */
  ephEncode(h: i32, key: string): u8[];
  ephApply(h: i32, bytes: u8[]): void;
  ephRemoveOutdated(h: i32): void;
  ephEvents(h: i32): string;
  ephNextUpdate(h: i32): u8[];
}
export default requireNative<Spec>('Loro');
