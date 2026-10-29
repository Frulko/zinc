# zinc:loro audit

## What it is
Collaborative documents (Loro CRDT): maps, lists, rich text and trees several people edit offline or live, with the loro-crdt npm API, interoperable with Loro in browsers, Swift and Rust.

## Targets and status
Modules `zinc:loro` and `loro-crdt`. plugin.json: macos and linux via cargo (Rust crate loro 1.16.2, MIT); no requires. macOS arm64 verified (and against loro-crdt 1.16.4); Linux in the manifest, not built or run; no cross-build (ZN-823), no Windows/mobile/web. Test: `tests/t1/loro.sh` (interpreter, AOT, QuickJS, Node interop with `LORO_CRDT`).

## What the docs have
- [x] overview, quick start, API list by class, limits, build explanation (cargo), size, test, status table
- [x] used by `examples/carnet` and `examples/carnet-nbe` (README mentions)
- [ ] a runnable example in examples/ dedicated to it (the apps are large)
- [ ] screenshot / GIF of two clients syncing, tutorial, troubleshooting

## What is missing
1. A small `examples/collab-notes` (two windows, sync through zinc:socket) and its screenshot.
2. A tutorial "Two peers, one text": create doc, edit, `subscribeLocalUpdates`, send over a WebSocket, `import`.
3. Troubleshooting: cargo missing (`zinc doctor`), first build ~100 s, Z5003 on unsupported targets, `Container` casts, call `free()`.
4. Cross-link to the Node interop test as a recipe for browser clients.
5. API table as a table (currently prose): add `LoroMovableList`/`LoroCounter` "read as lists" caveat to the main text; list `ImportStatus`, `Change`, `OpId`.
6. Linux build check on a real Linux box (hardware/owner).

## Wrong or stale
- The "How it runs: Not QuickJS" bullet conflicts with the next clause ("--engine quickjs runs the same index.ts") and the test list that runs QuickJS; reword.
- Doc has no Windows/mobile line; plugin.json has none either (consistent, but not stated).
- later.md notes the Dyn `f() === undefined` pitfall and the PCH problem; neither is in the doc's Limits.

## Suggested pages
Loro (API, generated: LoroDoc, containers, EphemeralStore) / Guide: CRDTs in plain words / Steps: sync two peers / Notes: Dyn values, containers cast, memory, build with cargo / Interop with loro-crdt, Swift, Rust / Example: collaborative notes.
