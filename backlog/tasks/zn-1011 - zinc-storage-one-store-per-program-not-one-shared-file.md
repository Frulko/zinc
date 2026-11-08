---
id: ZN-1011
title: 'zinc:storage: one store per program, not one shared file'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
updated_date: '2026-11-08 21:19'
labels:
  - storage
  - size-S
milestone: m-14
dependencies: []
ordinal: 3500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On desktop every program writes to `~/.zinc/storage.kv`: localStorage and AsyncStorage of two apps share keys, and JS-engine apps leave `@async/...` keys there while rn-showcase on QuickJS reads other prefs than the interpreter. Key the store by the project name or bundle id, migrate the old keys once, and make the engines agree.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- qjs_demos: rn-showcase on QuickJS ignores the prefs (language, notes) saved by earlier runs that the interpreter reads (French and 2 notes against English and 3 on 2026-10-29): zinc:storage seems keyed per engine, and the test runs in the user's ZINC_HOME; give the test its own ZINC_HOME and make the store the same on every engine.
- zinc:storage: one file for every program on a desktop (~/.zinc/storage.kv): localStorage and AsyncStorage of two apps share it (the
- Storage: AsyncStorage keys (`@async/…`) that JS-engine apps wrote to the shared `<zinc home>/storage.kv` stay there (only `<name>.` keys migrate), so fatty and other QuickJS apps start with an empty own store; a one-time migration needs a rule for keys no app owns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 two programs with different names write the same key without seeing each other
- [x] #2 the old shared keys migrate once to the owner program, `@async/...` included
- [x] #3 rn-showcase on QuickJS and the interpreter read the same prefs
- [x] #4 a T0 test with two project names
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worker branch).
- Already there before this task: every program keeps its own store <zinc home>/apps/<zinc.json name>/storage.kv on every engine (ZINC_APP_NAME set by appNameEnv for the interpreter, AOT and QuickJS); checked again: two projects on interp and QuickJS write the same key without seeing each other.
- Done here (src/host/sys_host.cpp storageLoad): the one-time migration is marked by storage.kv.migrated beside the app's store instead of 'the store does not exist yet', so apps whose store was already made (QuickJS apps such as fatty) get it too; '<name>.' keys move as before (an existing value of the app wins); '@async/' keys, which no app owns by name, are copied to each app once and stay in the shared store. Decision for the coordinator to record: 'unowned AsyncStorage keys of the shared store are copied, not moved, once per app (no data loss; they were shared before anyway)'.
- rn-showcase: with the same prefs in ZINC_APP_DATA, the interpreter and QuickJS draw the same frame 10 (and it differs from the default prefs); tests/t1/qjs_demos.sh now gives each run its own empty ZINC_APP_DATA so the user's prefs no longer leak in.
- Test: tests/t0/app_storage.sh (two project names, @async copy, QuickJS + interpreter, a removed key does not come back). Passing.
- Research: Electron keeps localStorage under app.getPath('userData') = <appData>/<app name> (https://www.electronjs.org/docs/latest/api/session); Tauri's appDataDir is <dataDir>/<bundle identifier> (https://v2.tauri.app/reference/javascript/api/namespacepath/); a one-time copy with a marker file is the usual migration.
- Proposed tests: tests/t1/app_storage_engines.sh, tests/t1/qjs_demos.sh.
<!-- SECTION:NOTES:END -->
