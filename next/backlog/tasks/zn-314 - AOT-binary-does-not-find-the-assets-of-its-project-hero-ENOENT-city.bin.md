---
id: ZN-314
title: 'AOT binary does not find the assets of its project (hero: ENOENT city.bin)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-08 13:56'
updated_date: '2026-10-10 17:14'
labels:
  - aot
  - bug
dependencies: []
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-282: `zinc build ../examples/hero/src/main.tsx -o hero` builds, but the binary panics with 'Uncaught Error: ENOENT: open city.bin' when run from examples/hero or examples/hero/assets, while `zinc run` finds assets/city.bin. The AOT output has no asset root (zinc.json "assets"/cwd of ZN-078).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the AOT build of examples/hero runs headless and its frame equals the interpreter's
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 (parallel worktree agent).

Cause: zinc:assets reads one directory, assetsDir() in next/src/host/sys_host.cpp, which was only the variable ZINC_ASSETS. zinc run sets it (assets beside the entry file or above it); a program built ahead of time has no zinc run in front of it, so it had no assets directory at all. The same held for zinc export: dist/<name>-<target>/assets was copied beside the executable and never read.

Fix (one place, where every asset open and the permission exemption route through): assetsDir() = ZINC_ASSETS when set; else assets/ beside the executable (zinc export, the .deb in /opt/<pkg>), else one level above it (zinc build <project> writes <project>/build/<name>: the rule zinc run applies to the entry file), else assets/ of the directory the program is started in (the case of this task: zinc build src/main.tsx -o hero, run from examples/hero). Resolved once, at the first asset call.

Security, because built programs that enforce their permissions now have an assets directory: (1) the exemption "the app's own assets need no permission" no longer covers a path with a ".." component (readText("../x") or fs.readText(assets + "/../x") were exempt by a plain prefix comparison: a way to read any file without fs:read); (2) a program that enforces its permissions does not take the assets of the directory it is started in (that directory is the user's, not the app's).

Decision (for the coordinator to record, no number allocated here): asset root of a built program. Options scored as RULES 4 (fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1): A, relative to the executable (beside, above) then the start directory: 66. B, the absolute path of the project's assets written into the binary at build time: 52 (breaks the byte-identical builds across directories of ZN-333, wrong once the app is shipped). C, assets embedded in the executable as the prototype did: 52 (the right long-term answer, but it is the pack work of ZN-433/ZN-436, size L; a decimal array literal also costs compile time, measured for kResources). A chosen; ZN-436 replaces the directory with packs behind the same function. Revisit when ZN-436 lands.

Proof (Intel Mac, build/zinc of this branch):
- before: /tmp/zn314/hero_before run from examples/hero: "panic: Uncaught Error: ENOENT: open city.bin".
- after: zinc build ../examples/hero/src/main.tsx -o /tmp/zn314/hero_after; ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT=... from examples/hero, and the same binary as <dir>/build/hero with <dir>/assets, started in /; interpreter: zinc run --interp . with the same variables. tools/pngdiff interpreter vs each: "differing pixels: 0 (tolerance 0, max diff 0, mae 0.000, psnr inf)"; the three PNGs have the same SHA-256 (3d7a2015...).
- tests/run --tier t1 --only aot_assets: PASS (new, tests/t1/aot_assets.sh: no assets, beside, above, start directory, executable before start directory, ZINC_ASSETS first; enforced: own assets readable, ".." refused with EACCES, start directory not taken). Also PASS: permissions, permissions_export, run_cache, clock.
- hero AOT build: about 60 s (not a measurement: the machine is shared with other trees).

Not proven: Linux (readlink /proc/self/exe branch compiles only there; deferred with the cross-platform pass). The hero frame comparison was run by hand, not added as a test (a hero AOT build is a minute: T2 material).

Follow-ups proposed (not created here):
1. "The macOS .app of zinc export carries its assets" (size S): the .app holds only the executable; assets stay in dist/<name>-macos/assets beside the plain executable, so the app started from Finder or moved elsewhere finds none. Copy assets into Contents/Resources/assets before codesign (tc/bundle.cpp writeBundle) and add <exe dir>/../Resources/assets to assetsDir(). AC: an exported .app of a project that reads an asset, moved to another directory and started, prints the asset; codesign --verify passes.
2. "The assets exemption of the permissions is read-only" (size S): denyByPermission exempts fs:write under the assets directory too, so an enforcing program whose assets directory is writable can create a symlink there to any file and read it without fs:read. AC: enforced, fs.writeText and fs.symlink under assets need fs:write; reading an asset still needs nothing; a test in tests/t0/permissions.sh.
3. "Guide: where a built program finds its assets" (size S, docs): docs/guide/01, 03 and 07 still say assets are compiled into the executable (the prototype); Next reads assets/ beside the executable until the packs of ZN-436.
4. Observation, not verified: plugins/webview/src/webview.mm reads getenv("ZINC_ASSETS") itself, so a built webview app does not get the executable-relative directory for zinc:// URLs.

affected.json (left untouched): add {"paths": ["src/host/sys_host.cpp", "src/host/permissions.cpp", "tests/t1/aot_assets.sh"], "tests": ["aot_assets"]}; the existing row for src/host/sys_host.cpp names a test "sys_host" that does not exist.

Usage: tools/usage reports n/a.
<!-- SECTION:NOTES:END -->
