# sqlite (`zinc:sqlite`)

## What it is
SQLite 3 databases in a Zinc program: open a file or `:memory:`, run SQL, get rows, transactions, and FTS5 full-text search. For apps that keep notes, scores, caches or search indexes.

## Targets and status
- plugin.json: macos, linux, windows, android, ios, rpi1, rmpp (amalgamation 3.53.4, FTS5 on) and a `web` entry (wasm build, `web/sqlite.js`, `sqlite_web.c`; test `web_plugins`). `requires: fs, heap>=4M`.
- Doc: "macos, linux, rpi1 and rmpp"; web, windows, android, ios absent.
- Tests: `tests/conformance/sqlite.ts` (+ .out at 3 sizes), `tests/t0/sqlite_fts.sh`, `tests/t1/web_plugins.sh`, `examples/testing/tests/sqlite.test.ts`, notify_relay tests.
- Examples using it: examples/carnet-nbe (FTS5 index), examples/notify-relay (read-only external DB), examples/testing.
- Later: ZN-850 (typed record decoding), ZN-430 (reading in place from archives), ZN-102 (Linux container conformance).

## What the docs have
- [x] Overview, native/size notes
- [~] Requirements: targets/`requires` listed; no storage-location note (where does `app.db` land on iOS/Android?)
- [x] Quick start
- [x] API reference: Database, Statement, Row, parameters, values, Blob. Missing `DatabaseOptions`, `RunResult` fields table, `SqliteError`, `Row.columns/values` semantics
- [x] Example code
- [~] Runnable example: used inside carnet-nbe and notify-relay, but no small `examples/sqlite-*` demo
- [ ] Screenshot/GIF
- [ ] Tutorial
- [ ] Commands
- [~] Notes: threads and version; nothing on FTS5, WAL/web persistence, file locations, migrations
- [~] Test named (conformance only; `sqlite_fts` not mentioned)

## What is missing
1. FTS5 section: create a `fts5` table, `MATCH` with prefix, `rank`, `snippet()` (take from `tests/data/sqlite/fts.ts` and examples/carnet-nbe/src/services/search.ts).
2. Screenshot of examples/carnet-nbe search results (`ZINC_SHOT=docs/img/sqlite-carnet-search.png zinc run examples/carnet-nbe`) as the "what you can build" picture.
3. 5-step tutorial "A notes database": open, create table, insert with params, query with named parameters, wrap in a transaction, read back after restart; with a runnable `examples/sqlite-notes` (zinc:ui list, or console).
4. Web target section: backed by wasm with in-memory storage (`SQLITE_OS_OTHER`, `TEMP_STORE=3`, no WAL): say what persists (verify in web/sqlite.js).
5. Where the database file goes per target; sandbox paths on iOS/Android; use `zinc:fs`/`appData` helpers (link docs).
6. Recipe: migrations with `PRAGMA user_version`; `PRAGMA journal_mode=WAL` on desktop; foreign keys are OFF by default in this build (`SQLITE_DEFAULT_FOREIGN_KEYS=0`): say how to turn on.
7. Recipe: opening another app's DB read-only (notify-relay), `{ readOnly: true }`.
8. API for `RunResult`, `DatabaseOptions`, `SqliteError`, `Statement.sql`.
9. Troubleshooting: "database is locked" (THREADSAFE=0, one connection), "unable to open database file", 64-bit integers beyond 2^53 lose precision.
10. Windows/android/ios status and the verification list. (hardware) for rpi1/rmpp.
11. Add `sqlite_fts` and the web test to the Test line.

## Wrong or stale
- "Sim. Node's `node:sqlite` stands in" and "Library version. The sim reports Node's SQLite version (3.51.2 with Node 24.14)": the Node prototype is gone; the stand-in `native/sqlite.sim.ts` should be checked and the note reworded or deleted.
- Target list omits windows, android, ios, web, all present in plugin.json.
- "Test. `tests/conformance/sqlite.ts`" is the frozen corpus; the live tests are `sqlite_fts`, `web_plugins`.
- "adds about 1 MiB" not re-measured with FTS5 enabled (manifest now defines `SQLITE_ENABLE_FTS5`).
- Doc does not mention FTS5 though the manifest description does.

## Suggested pages
- API: sqlite (generated: Database, Statement, Row, RunResult, SqliteError)
- Guide: Values, parameters and transactions
- Guide: Full-text search with FTS5
- Steps: A notes database
- Steps: Search your notes (FTS5)
- Examples: carnet-nbe search index, notify-relay (read-only), testing
- Notes: Threads, file locations per target, web persistence, size
