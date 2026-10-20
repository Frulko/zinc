---
id: ZN-436
title: 'zinc:assets v2: mounts, groups, progress, budgets, threads'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-10-11 12:07'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-433
  - ZN-435
  - ZN-314
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mount table with overlays; loadGroup/unloadGroup/prefetch with byte progress; reference-counted handles; priority queues; accounting against the target budget; decoding on the libuv thread pool (sliced per frame on one-core targets); a per-frame upload budget. The v1 calls read through the packs, and AOT programs find their packs. Report: docs/reports/games/toolchain-assets-loading.md (6.3 to 6.6).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a headless test loads three groups with monotone progress ending at 1
- [x] #2 unloading frees the memory (zinc mem)
- [x] #3 a load over budget fails, naming the group and the budget
- [x] #4 frames are deterministic under ZINC_DETERMINISTIC=1
- [x] #5 the AOT build of examples/hero runs (ZN-314's AC)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-11 (worktree agent, Intel Mac, load 3.3 to 5.6: another agent building).

What landed:
- `src/host/assets_host.{h,cpp}`: the run-time asset manager behind 17 appended system rows (`HostAssetsMount` to `HostAssetsStat`, include/zn/runtime.h; QuickJS installs them through isSysTailRow). Mount table of mapped packs (`mmap`, zpk::Reader in place) searched in order: program mounts in front (`assets.mount(path)`: a .zpk or a directory), then the base packs (`ZINC_PACKS`, else `assets/<target>/` beside a built program, `ZINC_PACK_TARGET` or this machine). A group is every mounted `<group>.zpk`; each entry comes from the first pack that has its name (overlays). `loadGroup`/`prefetch`/`unloadGroup`/`isLoaded`/`groups`/`get` (handle: text, bytes, release)/`stats`, Zinc side in modules.cpp, declared in lib/modules.d.ts.
- Scheduler: two queues (group, background; a loadGroup raises a pending prefetch of the same group), 4 jobs at a time on the libuv pool (`uv_queue_work`), each with a ZSTD_DCtx from the manager's free list (`zpk::Reader::read` takes an optional caller-owned context now). A turn runs on a prelude timer (once per frame in a frame loop, every ms otherwise; promises settle there, never in a frame callback): it makes resident, in queue order, what the workers finished, up to `ZINC_ASSET_TURN` bytes (4 MB, at least one entry) = the per-frame budget. A deterministic run waits for those jobs; one core or `ZINC_ASSET_THREADS=0` decodes them in the turn (the sliced path).
- Budget: `ZINC_ASSET_RAM`, the ram budget in force (zinc.json `assets.budgets.<target>.ram`, else targets/capabilities.json), set by zinc run (`cli::assetRun`) and in the `main` of a built program; `loadGroup` rejects a group whose bytes plus the resident and in-flight ones cross it, naming the group and the budget. Unloading frees what no handle holds; a held entry is freed with its last handle. `zinc mem` prints `assets: peak N bytes resident, M at exit` (JSON `assetsPeakBytes`, `assetsBytesAtExit`) through hostSys.
- v1 calls read the data entries of the mounted packs first, then the directory (an imported image is ZIM1, not the file: skipped). `zinc run` builds and mounts the dev packs only for a project with `assets.groups` (the others run exactly as before, `ZINC_PACKS` empty); `zinc pack` puts `packs/<group>.zpk` in the .zapp of such a project and its run mounts them; AOT links libzn_zpk/lz4/zstd/sha256 (main.cpp link line, cross list, tc.cpp target list).
- AC5 root causes, both from ZN-434: (1) `zinc build` writes `<project>/build/assets/<target>/`, which `zrt_program_assets_dir` took for the program's `assets/` (hero AOT: `panic: ENOENT .../examples/hero/build/assets/city.bin`, reproduced on main's code): a directory holding `<x>/.packs` is skipped now, and `zrt_program_packs_dir` finds the packs there; (2) the asset build dropped symlinked assets (`fs::relative` followed hero's city.bin link to `../../maps/...`, taken for a hidden name): fixed in its own commit with a regression line in tests/t0/assets.sh.
- Docs: docs/reports/zinc-next-assets.md "At run time", docs/zpk.md (decoder context).

Tests (real output):
- AC1, AC3, AC4, AC2: `tests/run --only assets_groups` PASS (2 s). tests/data/assets_groups: `zinc run .` loads boot, level1, level2: "several reports, monotone true, ends at 1, loaded true" for each; `assets: group 'big' needs 300000 bytes: over the ram budget of 262144 bytes (155554 in use)`; `get` before the load throws `assets: 'level1/b.json' is not loaded: load its group 'level1' first`; a handle keeps 12 bytes after unloadGroup and frees them on release; "all unloaded: resident 0, peak 155554"; `zinc mem main.ts`: "assets: peak 155554 bytes resident, 0 at exit"; the same lines on `--engine quickjs` and from a .zapp of the project; frames.ts (40 frames, ZINC_FRAMEHASH=all, 16 KB a turn) prints identical lines and hashes on two deterministic runs and with ZINC_ASSET_THREADS=0; overlay.ts: a mod's level1.zpk mounted in front replaces b.json for readText and the group load, a.bin still from the base.
- AC5: `zinc build examples/hero`, the binary run headless from /tmp: `framehash 3 1100x700 885c94a05ffdd6e7`, equal to `zinc run examples/hero` (same env); also with its packs alone (assets/ moved away) and its directory alone (ZINC_PACKS empty). tests/t1/aot_assets.sh gains the project case (build/<name> + build/assets/<target>: reads through the packs, the packs alone, the directory alone): PASS.
- Also PASS: assets, zpk, project_assets, cli_core, zapp, prof, permissions, modules, qjs, quickjs, device, museum_assets, run_compiled. `tests/run --changed` falls back to the whole tier (runtime.h, modules.cpp, main.cpp): not run. Build warning-free (clang); assets_host.cpp and zpk.cpp also with `zig c++ -Wall -Wextra -fsyntax-only`.

Measured (indicative, load 5.3 to 5.6, another agent building): a group of 64 text entries of 512 KB (32 MB, a 12 MB release pack, zstd 19), loadGroup to its promise, median of 7 real runs: 62 ms on the libuv pool, 214 ms decoded on the main thread (3.4x).

Decisions (no record number: worktree rule; for the coordinator):
- Groups are pack files (`<group>.zpk`, what ZN-434 writes), overlays per entry name, mounts in front: the Godot/Defold model of the report, no VFS.
- Handles are counted by the manager with an explicit `release()`: Zinc has no finalizer for a plain object; making them engine resources (R<k> of the native ABI) would release a dropped handle by itself (later.md).
- Slicing by bytes, not a 2 ms clock: deterministic, and the same knob as the per-frame upload budget (no GPU upload exists yet; textures come with ZN-439).
- Two priorities plus promotion; a "critical" queue waits for per-entry handles (sprites) that ask for one entry while its group loads.
- The budget in force is enforced, the desktop default (1 GB) included, although the report calls desktop limits soft: one rule, raised in zinc.json.
- zinc run builds packs only for projects with `assets.groups`, so every existing demo keeps its exact behaviour and no example gets a build/ directory from a run.

Lines for later.md (for the coordinator):
- zinc:assets handles as engine resources (native ABI R<k>) so that a dropped handle releases itself; release() is explicit today.
- zinc export: ship the packs beside the program (assets/<target>/) and stop its `zinc build` child from rewriting the dev packs over the release ones it just built (a cross child also names them by the zig target, build/assets/aarch64-linux).
- zinc:gfx loadFont (zn_asset_font) and zinc:webview zinc:// URLs read the assets directory only: read them through the packs.
- The browser host, the device core and the ESP32 (esp_partition_mmap of a data partition) serve no zinc:assets v2 row yet.
- Cross-platform pass: assets_groups on Linux x86_64/arm64 and the Pi 1 (one core: the in-turn decode path), a cross build that links libzn_zpk/lz4/zstd/sha256 and sets ZINC_PACK_TARGET in main.
- A 2 ms time slice on one-core targets if the 4 MB byte slice measures too coarse there.
<!-- SECTION:NOTES:END -->
