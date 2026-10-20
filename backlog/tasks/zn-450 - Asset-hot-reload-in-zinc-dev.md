---
id: ZN-450
title: Asset hot reload in zinc dev
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-10-11 14:14'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
  - ZN-436
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-import the changed asset, send it over the dev socket, swap it behind its handle and call assets.onReload; code changes still restart. Report: docs/reports/games/toolchain-assets-loading.md (8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 changing a sprite while game-2d runs updates the frame within 1 s with the score kept
- [x] #2 a code change still restarts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-11 (parallel worktree agent).

What: `zinc dev` (src/cli_core.cpp) gives each started version a socket pair (the program's end is ZINC_DEV_FD). A save that changes files under the assets directory alone, in a project that packs its assets (zinc.json assets.rules or assets.groups), no longer restarts: the dev packs are built again (cache: only the changed file is imported, the atlas is packed again), each entry is compared with the bytes it had (XXH3 of the packs before and after), and the changed entries go on the socket: `asset <kind> <size> <name>\n` + bytes, then `end\n`. The program (src/host/assets_host.cpp, listening from its first zinc:assets call, on the libuv loop, unreferenced) puts them in front of the packs at `end`: a resident entry takes the bytes in place (handles see them), a zinc:gfx image made from an image entry takes the new pixels under the same id (sys_host.cpp packImage, dyn_resize when the page size changes; the GL renderer re-uploads on the image version), and each name becomes a host event of kind 60. zinc:assets `onReload(name, cb)` runs the callbacks of that name (a no-op outside zinc dev: assetsStat(6), so QuickJS, which has no host events, is untouched). zinc:sprite's atlas() registers onReload on its table and re-reads it in place (Frame.copy, Animation.set): frames handed out move to their new rectangles. A code change, a change outside the assets dir, an entry that disappears, an unpacked project, or a version that does not read its socket (2 s send timeout) restarts as before; an import error prints and keeps the old asset. Docs: docs/reports/zinc-next-assets.md "Hot reload in zinc dev", docs/plugins/sprite.md, lib/modules.d.ts, zinc dev help.

Proof: tests/t1/asset_reload.sh (game-2d from the template, ROUND raised so the round outlasts the headless run, ZINC_INPUT holds the pointer on the first coin): `asset_reload: ok (swapped in 114-166 ms after the save; sent 40-41 ms)`; the shot after the swap has the new sprite (new colour pixels > old count, 0 old-colour pixels), the score bar (left 300x40) identical to the shot before, no `v2 started`; then `echo "// a change" >> src/scenes.ts` gives `v2 started`. 4.1 s, load 2.6 to 3.3.
Also run: dev_mode, assets_groups, sprite_atlas, splash, modules, std_surface, aot_assets, cli_core PASS (assets and project_assets SKIP: their unit binaries are not built in this tree). Smoke (a zinc:sprite program with onReload, 5 frames, ZINC_FRAMEHASH=last): interp and AOT 8ce9db620557acd7, QuickJS runs (7c9fa8d32521ccd7 at 320x240). One windowed run (GL, load 3.8): the title screen's player changed on screen 41 ms after the save (shot f-300).

Decision (for a record): the dev socket is a local socket pair whose end the program inherits (ZINC_DEV_FD, unset and close-on-exec once read, so processes the program starts never steal it), and the message carries the entry's bytes rather than a path, so a device link can carry the same lines later; the entries the program gets are those whose bytes changed in the rebuilt packs (diff by hash), not a mapping from source file to entries, since one sprite changes the whole atlas page and table.

Later (later.md lines): game-2d does not start on --engine quickjs (`Could not find export 'Scene'`: an interface import is not stripped), and QuickJS ran the smoke at 320x240, not the zinc.json size; QuickJS has no host events (__addEvHandler: onReload, zinc:sys signals/stdin, zinc:process events); a project without asset rules or groups still restarts on an asset save (loose images are baked into the program); a sprite removed from an atlas keeps its stale Frame in zinc:sprite until a restart; cross-platform pass: the same messages over zinc dev --device (TCP instead of the socket pair).

Not checked: Linux and the boards (no cross runs during a Mac task); a quiet machine (other agents built throughout, load 2.6 to 4.7); the QuickJS engine under zinc dev (dev runs the interpreter).

Usage: tools/usage printed n/a in this worktree agent.
<!-- SECTION:NOTES:END -->
