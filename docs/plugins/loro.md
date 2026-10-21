# loro plugin (`zinc:loro`, also `loro-crdt`)

Collaborative documents with the [Loro](https://loro.dev) CRDT: maps, lists, rich text and movable trees that several
people edit at once, offline or live, and that always converge. The API is the one of the npm package
[loro-crdt](https://www.npmjs.com/package/loro-crdt), so code written for it imports `'loro-crdt'` and compiles here, and
the bytes a Zinc program exports are the ones Loro's other clients read: the browser (loro-crdt), Swift (loro-swift) and
Rust (the `loro` crate), and the reverse.

- **Native.** The CRDT is the Rust crate [`loro`](https://crates.io/crates/loro) 1.16.2 (MIT), the same code loro-crdt
  compiles to WebAssembly. `plugins/loro/rust` is a small crate (`zinc_loro`) with a C ABI over it; its `Cargo.lock` pins
  every dependency. `native/loro.host.cpp` turns the ABI into the plugin's native module, and `index.ts` is the loro-crdt
  API in Zinc over it. Not QuickJS: the typed engine (interpreter and AOT) calls the crate directly, and `--engine quickjs`
  runs the same `index.ts` over the same library.
- **Built by cargo.** The manifest's `"cargo": "rust"` makes the plugin build run `cargo build --release --locked` for this
  machine's Rust triple (`aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`...) into the cache
  (`~/.zinc/cache/<target>/cargo/`), and link the static library into the plugin and into compiled programs. The first
  build downloads the crates from crates.io and compiles them (about 100 s on an arm64 Mac under load); later builds reuse
  cargo's own cache, and a program start does not run cargo at all while the crate's files are unchanged. Without cargo
  the build stops with what to install ([rustup.rs](https://rustup.rs)); `zinc doctor` says whether cargo is found.
- **Size.** A compiled program that imports the plugin is 5.4 MB on arm64 macOS against 0.37 MB without it; the plugin's
  shared library (what the interpreter loads) is 3.7 MB. A program that does not import it carries none of it.
- **Test.** `tests/t1/loro.sh` (`tests/data/loro/`): the same program on the interpreter, compiled and on QuickJS; a
  document written by Node's loro-crdt (committed fixture); and, with `LORO_CRDT` naming a directory where
  `npm install loro-crdt` was run, Node reads what Zinc wrote and Zinc reads what Node wrote, compared as JSON.

| target | status |
|---|---|
| macos | supported, verified on arm64 (loro-crdt 1.16.4 agrees) |
| linux | in the manifest (`-lpthread -ldl -lm`), not built or run yet |
| anywhere else | not available (error Z5003); a cross build refuses a plugin with Rust code for now |

```ts
import { LoroDoc, LoroMap, LoroText } from 'loro-crdt';   // or 'zinc:loro'

const doc = new LoroDoc();
doc.setPeerId(1);
const text = doc.getText('text');
text.insert(0, 'Hello world');
text.mark({ start: 0, end: 5 }, 'bold', true);
const block = doc.getTree('blocks').createNode();
block.data.set('id', 'b1');
const body = block.data.setContainer('body', new LoroText()) as LoroText;
body.insert(0, 'first paragraph');
doc.commit({ message: 'seed' });

doc.subscribeLocalUpdates((bytes: u8[]) => socket.write(bytes));   // to the other peers
peer.import(doc.export({ mode: 'snapshot' }));                     // or { mode: 'update', from: version }
```

## API

What `packages/collab` of Carnet uses, and the rest of the everyday surface:

- `LoroDoc`: `new LoroDoc()`, `LoroDoc.fromSnapshot(bytes)`, `setPeerId(n)` (and `setPeerIdStr` for any u64), `peerId`,
  `peerIdStr`, `commit({ message, origin, timestamp })`, `getMap` / `getList` / `getText` / `getTree`,
  `export({ mode: 'snapshot' })`, `export({ mode: 'update', from? })`, `import(bytes)` (`{ pending }`), `frontiers()`,
  `oplogFrontiers()`, `version()`, `oplogVersion()`, `frontiersToVV`, `checkout(frontiers)`, `checkoutToLatest()`,
  `isDetached()`, `toJSON()`, `getAllChanges()` (a `Map` of peer to changes: `counter`, `length`, `lamport`,
  `timestamp`, `message`, `deps`), `setRecordTimestamp`, `configTextStyle({ bold: { expand: 'after' } })`,
  `subscribe(cb)` (a `LoroEventBatch`: `by` 'local' / 'import' / 'checkout', `origin`, `events` with `target`, `path`
  and `diff`), `subscribeLocalUpdates(cb)`, `free()`.
- `LoroMap`: `get`, `set`, `delete`, `keys`, `values`, `entries`, `size`, `clear`, `setContainer`,
  `getOrCreateContainer`, `toJSON`, `id`.
- `LoroList`: `insert`, `push`, `delete`, `get`, `length`, `insertContainer`, `pushContainer`, `toArray`, `clear`,
  `toJSON`.
- `LoroText`: `insert`, `delete`, `mark({ start, end }, key, value)`, `unmark`, `toString`, `toDelta`, `length`
  (positions in UTF-16 code units, as in JavaScript).
- `LoroTree` / `LoroTreeNode`: `createNode(parent?, index?)`, `delete`, `move`, `nodes()` (deleted ones included),
  `roots`, `getNodeByID`, `has`, `isNodeDeleted`; a node's `id`, `data` (its map), `createNode`, `move(parent?, index?)`,
  `parent()`, `children()`, `index()`, `isDeleted()`.
- `VersionVector`: `encode`, `VersionVector.decode`, `toJSON` (a `Map`), `get`. `EphemeralStore` (presence): `set`,
  `get`, `delete`, `getAllStates`, `keys`, `encode`, `encodeAll`, `apply`, `removeOutdated`, `subscribe`,
  `subscribeLocalUpdates`.

Events are delivered as loro-crdt delivers them: synchronously, before the `commit`, `import`, `export` or `checkout` that
caused them returns.

## Limits

- **Values are Dyn.** A value (loro-crdt's `Value`: any JSON) goes in as `unknown` and comes out as a Dyn of the gradual
  profile; `toDelta()` parts and event diffs are Dyn too. Numbers are stored as doubles, as a JavaScript number is in
  loro-crdt. Binary values are not supported. A container inside an event's diff is given as its deep value, not as a
  container object; a deleted map key in a diff is `null` (loro-crdt: `undefined`).
- **Containers come back as `Container`.** The engine has no generic methods yet, so `setContainer`, `insertContainer`,
  `pushContainer` and `getOrCreateContainer` return `Container`: cast it (`as LoroText`), or keep the object passed in,
  which is the one returned, attached. A container made with `new` is empty until attached.
- **Peer ids.** `setPeerId` takes a number, exact below 2^53 (loro-crdt also takes a bigint); `setPeerIdStr` takes any
  u64 as its decimal string, and `peerIdStr` gives it back.
- **Native memory.** A document lives until `free()` (Zinc does not run finalizers); a program that makes documents in a
  loop frees them.
- Not here yet: `LoroMovableList` and `LoroCounter` (read as lists), cursors, the undo manager, shallow snapshots, JSON
  updates, `fork`, `diff` / `applyDiff`, the `from` / `to` frontiers of an event batch.
