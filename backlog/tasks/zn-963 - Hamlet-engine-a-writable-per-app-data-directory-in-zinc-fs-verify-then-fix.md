---
id: ZN-963
title: >-
  Hamlet: engine: a writable per-app data directory in zinc:fs (verify, then
  fix)
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 13:07'
updated_date: '2026-11-08 19:38'
labels:
  - hamlet
  - demo
  - m2
  - engine
  - fs
  - size-S
milestone: m-30
dependencies: []
ordinal: 2400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reuse study found no app-data path in lib/modules.d.ts. Verify; if missing, add fs.appDataDir() on host targets with a test (AGENTS.md: fill engine gaps, no hard-coded path). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Written down whether the API exists; if not, fs.appDataDir(appName) returns a writable directory on macOS/Linux/Windows (host only now)
- [x] #2 T0 test writes, reads and removes a file in it on the 3 engines
- [x] #3 docs/plugins or reference doc updated; CHANGELOG line if user visible
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: the API exists, as zinc:sys `dataDir()` (src/frontend/modules.cpp; host query "data.dir", `appDataDir()` in src/host/sys_host.cpp): `<zinc home>/apps/<zinc.json name, else the program's folder>/`, made on first call, `ZINC_APP_DATA` replaces it; zinc:storage lives there; it works on the interpreter, QuickJS and AOT (a built binary keeps the name). The gap the reuse study saw: it was missing from lib/modules.d.ts (editor types, `zinc doc --cheatsheet`). Fixed: declared and documented there, docs/cheatsheet.md regenerated.

Decision (reversible): no `fs.appDataDir(appName)` in zinc:fs. One folder per app already exists and is what zinc:storage, the imageio thumbnails, the remarkable plugin and the Hub's reset use; a second API naming another folder would split an app's data.

Research: Electron `userData` = appData/<productName> (~/Library/Application Support, %APPDATA%, $XDG_CONFIG_HOME), https://www.electronjs.org/docs/latest/api/app#appgetpathname ; Tauri `appDataDir` = data dir + bundle identifier (~/.local/share, Roaming AppData), https://v2.tauri.app/reference/javascript/api/namespacepath/ ; neither sanitizes the name (Zinc refuses a name with a slash, a backslash or a leading dot).

Test: tests/t0/app_data_dir.sh writes, reads and removes a file in `dataDir()` on `--interp`, `--engine quickjs` and an AOT build: PASS; cheatsheet PASS.

later.md line (for the coordinator): - ZN-963: an exported desktop app could keep its dataDir() where the OS expects it (~/Library/Application Support/<app.id>, %APPDATA%, $XDG_DATA_HOME), as Electron and Tauri do, so backups and uninstallers find it; today it is ~/.zinc/apps/<name>.
<!-- SECTION:NOTES:END -->
