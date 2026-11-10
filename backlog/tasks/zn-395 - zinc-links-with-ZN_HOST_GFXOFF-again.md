---
id: ZN-395
title: zinc links with ZN_HOST_GFX=OFF again
status: Done
assignee: []
created_date: '2026-10-09 03:40'
updated_date: '2026-11-10 08:14'
labels:
  - build
  - size-S
dependencies: []
ordinal: 18400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-332: configured with -DZN_HOST_GFX=OFF, main.cpp still calls zn::host (installResources, benchScene, damageCheck, replayScene) and zn::host::perm::configure, so zinc does not link. Guard those commands with ZN_HOST_GFX (they report that the build has no graphics host) and keep perm in a library that is always linked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cmake -DZN_HOST_GFX=OFF builds zinc; a headless program runs; the graphics commands say the build has none
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-10, work/395, based on develop fc26777c6 (includes asynchronous updater 3a87af69a).

Research: Godot distinguishes a dedicated server build without graphics from runtime headless rendering (https://godotengine.org/download/3.x/server/, https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_dedicated_servers.html). CMake documents embedding object-library objects in static archives with $<TARGET_OBJECTS:...> (https://cmake.org/cmake/help/latest/command/target_link_libraries.html#linking-object-libraries). Reused that mechanism; no dependency or build framework added.

The always-linked zn_host_permissions OBJECT library owns the existing real permission implementation. The normal graphics archive embeds its object, and zn_app_host inherits it through the existing source-list copy, so native AOT/mobile archive recipes need no new archive. Removed the no-host configure no-op. The no-host image reader checks that policy too; it does not claim filesystem access is a graphics operation.

Capture variants and graphical bench explicitly fail with this build has no graphics host; their scene implementations compile only with ZN_HOST_GFX. Doctor reports renderer none. Optional no-host adapters retain actual monotonic clocks and sleeps for QuickJS language timers; active() is false because this configuration has no native host I/O table. System calls still report their existing unavailable-in-this-build errors. The existing canvas fallback remains unchanged. LAN dev helpers now follow ZN_AGENT and unavailable --lan reports its missing device-agent capability (coordinator approved the narrow cli_core carveout). On Mach-O only, targeted -U options leave the checked weak window/resource-statistics hooks absent; no fake services were added. Updater/fused-host paths and the normal graphics host keep their behavior.

Proof, all heavy commands through /Users/mowmow/Lab/zinc/tools/work-run, serial and bounded:
- 120 cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DZN_HOST_GFX=OFF -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache -DCMAKE_DISABLE_PRECOMPILE_HEADERS=ON: PASS.
- 900 tools/build zinc: PASS, final log .logs/395/final-build.txt. Baseline failure and initial fixed build retained in .logs/395. Original baseline emitted existing V8 SDK unused parameters, dev/hot and cli_mqjs unused helpers, and vendored nanosvg sign-compare warnings. Own changed code is warning-free; the full rebuild of cli_core still reports that existing nanosvg warning. No warning suppression added.
- 90 tests/run --tier t0 --only no_graphics_host: PASS (roughly 2 seconds). Covers the standalone permission enforcement/reset self-check, zinc check, interpreter console execution, a real QuickJS timer, explicit refusal of native host filesystem calls, all six capture forms and graphical bench refusal. The final include-directory-only rebuild is byte-identical to this tested binary.
- 30 env ZINC_HEADLESS=1 ZINC_STEPS=0 build/zinc run --interp tests/golden/run/abstract.ts: PASS, unchanged existing program prints 10 24 (under 1 second).
- Final build/zinc SHA256 eb821c29967fd84b9afcd8bdb5e6a1e008c34b94de215d7214609df2a677c651; otool -L lists only libc++ and libSystem, no SDL or GUI frameworks. No size or speed claim.
- git diff --check: PASS. No process from this worktree remains.

Default graphics integration build/smoke belongs to the coordinator; it was not rebuilt in this OFF tree. No protected runtime/HAL/UI/frontend source changed. No suite, T1/T2/demo, benchmark, pixel, conformance, fuzz, CI or cross build ran. usage: n/a (tools/usage).

Proposed tests:
- Default graphics integration: tools/build zinc; build/host_permissions_test; one existing background/headless capture smoke (seconds, memory unmeasured). Confirms archive embedding and normal dispatch after integration.
- On OptiPlex and Mojave, configure/build OFF then tests/run --tier t0 --only no_graphics_host (build duration/memory unmeasured; regression seconds). Checks ELF and older Mach-O linkage; unproven here.

Proposed later line: ZN-395: prove ZN_HOST_GFX=OFF on OptiPlex and Mojave, including optional weak imports and the no_graphics_host regression; only development Mac arm64 is proven.
<!-- SECTION:NOTES:END -->
