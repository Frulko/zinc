---
id: ZN-841
title: 'reMarkable: the Zinc engine on the tablet runs a .zapp'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 19:26'
updated_date: '2026-10-25 20:12'
labels:
  - remarkable
  - size-L
milestone: m-11
dependencies: []
ordinal: 550460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hub step 1 (owner 2026-10-25: an app store for the reMarkable). zinc itself, built for aarch64-linux (glibc of the tablet), installed as an AppLoad tile, runs a .zapp with the display-rmpp driver: qtfb (L0) under AppLoad and the ink session (L2) under the lease. zinc compiles a project on the tablet (TS to ZBC, no C toolchain). Native plugins come prebuilt in the .zapp (native/linux-aarch64). docs/reports/remarkable-bridge-design.md, docs/targets/remarkable-paper-pro.md, docs/zapp.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 an engine bundle for the tablet (zinc aarch64-linux plus display-rmpp, lease, libquill.so) is produced by one command from the Mac and installed by its deploy.sh
- [x] #2 zinc run notes.zapp on the tablet draws on qtfb under AppLoad, and in the ink session through the lease; proven by the owner on the tablet
- [x] #3 zinc pack on the tablet packs a project copied there, and the pack runs
- [x] #4 a T1 test proves the bundle's layout and launcher scripts on the Mac
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (worktree agent). Done: AC1, AC3, AC4. Left: AC2 (needs the screen: the owner on the tablet). Status Review.

Decision: native code on the tablet comes from the engine's package, not the .zapp. The engine detects a reMarkable (/sys/devices/soc0/machine, ZINC_DEVICE_TARGET overrides) and loads display-rmpp's "rmpp" entry from share/zinc/plugins/display-rmpp/prebuilt/rmpp, which tools/package cross-builds for aarch64 (plugin-build --target linux-aarch64 with ZINC_EXPORT_TARGET=rmpp) with default options. The project's display options reach the prebuilt driver as ZINC_RMPP_<OPTION> env (set only when different from the default; an env already set wins); rmpp.cpp now also reads ZINC_RMPP_FAST_HZ/COLOR_HZ. Under cross, a non-"linux" entry's prebuilt dir is prebuilt/<entry> (else the rmpp pass picked up the emulator's prebuilt/aarch64-linux: same key).

Bundle: tools/rmpp-engine (build-linux aarch64 + package, then lease via zig musl static, lib/libquill.so, QUILL-LICENSE, bin/zinc-app, bin/zinc-tile, share/zinc/rmpp/{icon.png,verified}) -> dist/rmpp/zinc-rmpp.tar.gz + deploy.sh. Sources integrations/remarkable-engine/.

Proof on the tablet (OS 3.29.0.153, headless, scratch dir /home/root/zinc-scratch/zinc via ZINC_RMPP_DIR=... dist/rmpp/deploy.sh): deploy printed `zinc-next 0.8.2+113.g285df266`; `zinc pack` of examples/remarkable/notes on the tablet -> build/notes.zapp (6 files, 1109504 bytes); `ZINC_HEADLESS=1 ZINC_DISPLAY=rmpp ZINC_FRAMES=3 bin/zinc-app notes.zapp` -> `zinc: plugins: display-rmpp` and `display-rmpp: QTFB_KEY unset (...); running headless`, rc 0, no compiler on the tablet (no ~/.zinc/toolchains). zinc-tile into a scratch AppLoad dir made both tiles; the session tile accepted the tablet's libqsgepaper hash. `bin/lease status` runs. Mac: tests/run --only rmpp_engine, rmpp_sim, rmpp_lease PASS.

Owner steps for AC2 (screen): on the Mac `tools/rmpp-engine` (or reuse dist/rmpp), then `dist/rmpp/deploy.sh root@10.11.99.1 <notes.zapp> <notes.zapp> --session` (or on the tablet: `/home/root/zinc/bin/zinc-tile <zapp> [--session]`); AppLoad: reload, tap zinc tile `notes` (qtfb) then `notes-session` (lease). Recovery: docs/targets/remarkable-paper-pro.md "Recovery".

Known limit: a project's own native module (notes' RmppRefresh) gets its sim stand-in on the tablet engine (warning); Colour preview then does not switch the panel.

later.md lines (for the coordinator):
- ZN-841: notes' RmppRefresh project native module falls back to its sim stand-in on the tablet engine; move the refresh switch into display-rmpp (a zinc:gfx/plugin API) so packed apps keep Colour preview.
- ZN-841: zinc-tile could take the app's own icon from the .zapp (zinc.json app.icon) instead of the shared one.
- ZN-841: the display size on the tablet engine comes from zinc.json targets.linux; an app without it runs headless ("profile must be 1620x2160"); default to the model row's size when the engine runs on a reMarkable.

Owner on the tablet 2026-10-25: both tiles (zinc run notes.zapp on qtfb, and notes-session under the lease with Quill) work well.
<!-- SECTION:NOTES:END -->
