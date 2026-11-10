---
id: ZN-513
title: 'chip and pocketchip: capabilities rows and docs'
status: Done
assignee: []
created_date: '2026-10-09 07:40'
updated_date: '2026-11-10 21:30'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-512
ordinal: 52600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** capabilities.json rows chip/pocketchip, a T0 table test, docs/targets/chip.md. Drop zinc:platform constants (see ZN-535).

**What is left (review 2026-10-25):** capabilities.json rows (T2, gles2, gpio, power; pocketchip touch+keyboard), a T0 table test, docs/targets/chip.md. Already there: src/frontend/profile.cpp:24; src/cli_core.cpp:1041; targets/capabilities.json has no chip.

Profile rows in src/frontend/profile.cpp and compiler/src/cli.ts (chip: f64, 720x576, heap 128M; pocketchip: f64, 480x272, heap 128M), zigTargetFor chip/pocketchip -> armv7-linux in src/cli_core.cpp, entries in targets/capabilities.json (tier T2, gpu gles2, gpio, power, dynlib false; pocketchip with touch and keyboard true, pointer false) and the table of docs/targets/capabilities.md; new docs/targets/chip.md (boards, OS choice, flashing, deploy). (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc build --target chip and --target pocketchip build hello and hero
- [x] #2 zinc:platform exposes PROFILE, SCREEN_W/H, TOUCH, KEYBOARD, GPIO, POWER for both profiles
- [x] #3 a zinc.json requires that the profile does not meet is refused with the profile named
- [x] #4 T0 test of the profile table and the capabilities rows
- [x] #5 docs/targets/chip.md exists and links this report
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-10 (ZN-414): profile rows chip and pocketchip exist in src/frontend/profile.cpp, and export/deploy map chip/pocketchip to the new armv7-linux target (-mcpu=cortex_a8) in cli_core.cpp zigTargetFor; capabilities rows, zinc:platform, docs and the builds remain.
Review 2026-10-25: done-partly. Profile rows chip and pocketchip exist (src/frontend/profile.cpp:24-25) and export/deploy map them to armv7-linux. Missing: capabilities.json rows (0 matches), zinc:platform constants, docs/targets/chip.md, a T0 table test. Cheap, but only matters if the CHIP is pursued. Evidence: src/frontend/profile.cpp:24; src/cli_core.cpp:1041; targets/capabilities.json has no chip
Review 2026-11-07: rewrite. Profile rows exist; capabilities rows, table test and docs are pure Mac work (no board). Evidence: src/frontend/profile.cpp:24-25; targets/capabilities.json has no chip

2026-11-10 — capability/table phase (non-building worker):
- Added CHIP and PocketCHIP capability rows: T2/GLES2, GPIO and power, dynlib false. Bare CHIP touch/pointer/keyboard are optional peripherals; PocketCHIP touch and keyboard are true and pointer false. Other Linux hardware flags, classic/Yoga settings, host-module list and unmeasured asset starting values follow the existing rpi1 contract. No engine, ABI, profile table or toolchain source changed.
- Added docs/targets/chip.md, linked the hardware report and capability table, documented OS/FEL/USB/NAND choices and existing build/deploy commands, and distinguished board declarations from tested backends. Current source uses dynamic glibc arm-linux-gnueabihf.2.28 with cortex_a8+neon; the report's static-musl proposal was not implemented. No Jessie, GPU, flashing or physical execution claim.
- Existing scalar-key generation supplies GPIO and POWER without new platform code. T0 covers actual platform PROFILE/f64/128 MiB heap/input/GPIO/POWER/GLES2/T2 constants, f64 arithmetic, exact profile dimensions through project requirements, and named dynlib/GLES3/PocketCHIP-pointer refusals. Added its affected-path mapping and user-visible changelog line.

Proof and remaining criteria:
- AC3, AC4 and AC5 pass. AC1 remains unproven: neither Hello nor Hero was cross-built here for either target; ZN-512's earlier ARM Hello ELF does not prove this criterion or Hero.
- AC2 remains open: the generic constants exist, but a plain host run with --profile chip or --profile pocketchip returns SCREEN_W/H = 320x240. The profile table and width/height requirement checks correctly use 720x576 and 480x272. Do not set ZINC_SIZE to mask this engine gap; fix shared profile defaults in the subsequent sole-core phase, then restore runtime dimension assertions in chip_profiles.sh. No acceptance waiver or follow-up task.
- Minimal reproduction saved at .logs/chip-profiles-20261110/screen.ts: import { PROFILE, SCREEN_W, SCREEN_H } from 'zinc:platform'; console.log(PROFILE + ' ' + SCREEN_W + ' ' + SCREEN_H);. Actual output chip 320 240 / pocketchip 320 240 in .logs/chip-profiles-20261110/screen.log. Next command: tools/work-run 15 env ZINC=<compiler> ZINC_ROOT=$PWD ZINC_HEADLESS=1 ZINC_BACKGROUND=1 <compiler> run --interp --profile chip .logs/chip-profiles-20261110/screen.ts (repeat pocketchip); then inspect src/frontend/modules.cpp platformModuleSource and CLI profile-size propagation, without a target-specific workaround.
- Final exact proof: /Users/mowmow/Lab/zinc/tools/work-run 45 env ZINC=/Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc ZINC_ROOT=/Users/mowmow/Lab/zinc/.worktrees/513 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 tests/run --only chip_profiles. PASS (1 passed, 0 failed), .logs/chip-profiles-20261110/t0.log; compiler source b7c0d7b4c, SHA256 54114b62024f586d835630c7964bfa7e037f93c989b8d9464961b04beea46a9b recorded in compiler.sha256 and screen-compiler.sha256 beside it. No rebuild; adjacent common archives/modules retained. First T0 run caught the SCREEN bug (.logs/20261110-174130.log); one subsequent harness invocation lacked ZINC and failed with missing local binary, then the correct explicit environment passed.
- JSON parsing, shell syntax, report-link existence and git diff --check pass. Every engine/test run bounded via work-run and per-command timeout, headless/background; temporary fixtures removed; no process left running. No timing or RSS measurements; usage: n/a.

Research already delegated by coordinator, primary sources rechecked 2026-11-10:
- https://docs.getchip.cc/pocketchip — built-in touch/keyboard and board-managed battery charging.
- https://raw.githubusercontent.com/NextThingCo/CHIP-dt-overlays/master/firmware/early/x-chip-pocketchip.dts — resistive touch, TCA8418 keyboard and LCD overlay disabling composite.
- https://raw.githubusercontent.com/torvalds/linux/master/arch/arm/boot/dts/allwinner/sun5i-r8-chip.dts — AXP209 battery/AC and PCF8574A GPIO hardware, not Zinc backend proof.
- https://docs.mesa3d.org/drivers/lima.html — Mali-400 GLES2, separate display driver and limited fragment precision; no GLES3/highp upgrade claim.
- https://github.com/m4xx3d0ut/pocketchip-debian-builder — Debian 13, FEL/USB bring-up and experimental NAND/SLC installation. Legacy https://docs.getchip.cc/chip returned 403 to the browsing tool; retained its canonical manual link without claiming flashing was tested.

Proposed tests (owner picks):
- After the shared profile-default fix: exact chip_profiles T0 plus both minimal SCREEN repro runs (seconds, memory unmeasured; tiny fixtures expected below 100 MiB) to prove runtime and requirement dimensions agree.
- Bounded zinc build --target chip / --target pocketchip for Hello and examples/hero, one cross-build at a time (minutes cold, memory unmeasured; stop if growing past a few GiB), inspecting ARMv7/NEON hard-float ELF metadata; AC1 remains open until all four pass.
- Physical board runs of the built programs, input/display/GPIO/battery checks and asset-budget/Lima-precision checks (short runs, memory unmeasured). No suite, T1/T2, demo, benchmark, pixel comparison, conformance, fuzz or CI was run.

Proposed later.md line for coordinator: - ZN-513: Measure the T2 asset starting budgets and Lima fragment-precision limits on actual CHIP/PocketCHIP; profile declarations are not hardware certification.

2026-11-10 — shared screen-default and literal build-target phase:
- Fixed the root cause once in frontend platformModuleSource: SCREEN_W/H start from currentProfile's existing width/height, with the previous 320x240 fallback when no profile is selected. The existing valid ZINC_SIZE override remains last; invalid/zero sizes retain the profile defaults. Every current Profile row has positive dimensions; no new profile, size parser, target special case or API was added.
- Read all consumers: frontend module imports feed interpreter/AOT; QuickJS moduleText and bundle capsJson call the same platformModule wrapper. Added runtime screen assertions to chip_profiles, plus valid/invalid/zero overrides and the unprofiled fallback; its existing requirements and capability checks remain intact. CHIP docs and the user changelog now reflect corrected defaults.
- Found and fixed the next literal AC1 gap: tc::findTarget lacked chip/pocketchip aliases even though export's zigTargetFor knew them. Reused the existing alias table to select armv7-linux. tc_cache now checks both real CLI spellings, ARM hard-float triple/NEON flags and shared warm object-cache reuse. No main.cpp, HAL, UI, runtime or allocator change.
- AC2 now passes: direct interpreter/AOT/QuickJS proof of PROFILE, SCREEN_W/H, TOUCH, KEYBOARD, GPIO and POWER on both profiles, plus valid/invalid/zero overrides and the unprofiled 320x240 fallback: 27 exact cases. Native AOT executables were built and executed, rather than comparing generated text. The first scratch host check imported GPIO (absent on macos) and was corrected to import only SCREEN_W/H; all final cases pass.
- Exact tests PASS: chip_profiles and tc_cache, individually through absolute tools/work-run with the own-tree engine and explicit ZINC_ROOT. Own tools/build zinc and subsequent alias-only relink succeeded. Initial cold build reports unchanged V8 SDK unused-parameter warnings, asset/agent initializer warnings, vendored rg_etc1 warnings and the previously recorded NanoSVG signed comparison warning; no warning in the changed frontend or toolchain lines. No warning cleanup outside scope.
- Literal Hello cross-builds PASS for both targets using installed pinned Zig 0.15.2, an isolated ZINC_HOME and no SDK install/symlink changes. CHIP: 10,506,576 bytes, SHA256 e1722df3e64381c72c08f0834b19ee3eab7635394a67ca7aa2e3eea622d8c049. PocketCHIP: 10,506,596 bytes, SHA256 398e646a9bf3aeb28bf7a131585523f0a0c58bbd6e4276e9f50547b041f02124. GNU readelf independently verifies ELF32 ARMv7, VFPv3, NEONv1, EABI5 hard-float and /lib/ld-linux-armhf.so.3. Neither ARM executable was run; no static-musl claim.
- Durable proof directory: /Users/mowmow/Lab/zinc/.worktrees/513/.logs/profile-screen-20261110/. summary.json records all 27 cases and compiler SHA256; verify.log, chip-t0.log, tc-cache-t0.log, build.log and build-alias.log hold exact results. cross-hello-summary.json and per-target hello-build/readelf logs retain cross artifacts and metadata. Per-case AOT build/run and interpreter/QuickJS logs are adjacent. Before-alias Hello/Hero command logs prove both target spellings previously returned unknown target.
- Design choice for coordinator (no new D number needed): use the existing Profile table and target-alias map as the two existing sources of truth; explicit dimensions keep their existing precedence. No lifecycle/state-machine change. Usage: n/a.

- AC1 remains open, status Backlog: both literal Hello builds pass, but unchanged examples/hero fails on both targets because plugin video needs libavformat in the absent armv7-linux sysroot. Actual commands: /Users/mowmow/Lab/zinc/tools/work-run 30 env ZINC_ROOT=/Users/mowmow/Lab/zinc/.worktrees/513 ZINC_HOME=/Users/mowmow/Lab/zinc/.worktrees/513/.logs/profile-screen-20261110/cross-home ZINC_ZIG=/Users/mowmow/.zinc/toolchains/zig-aarch64-macos-0.15.2/zig ZINC_HEADLESS=1 ZINC_BACKGROUND=1 build/zinc build --target chip examples/hero -o .logs/profile-screen-20261110/chip-hero (repeat pocketchip). chip-hero-build.log and pocketchip-hero-build.log preserve the exact failure. The first CHIP attempt hit its 120s cold cross-library bound; the PocketCHIP continuation completed those libraries and reached the FFmpeg blocker, then a warm CHIP run reproduced it. No Hero source or plugin was weakened to pass. Next: supply the verified ARMv7 FFmpeg sysroot through existing ZN-334, then rerun these two commands; no new task.
- All commands were bounded/headless/background through the absolute work-run queue. Own cold graphics cross build briefly had a largest observed process RSS of 597 MiB; this is a safety observation, not a performance result. No ARM execution, simulator, QEMU, remote machine, suite, T1/T2, demo harness, benchmark, pixel comparison, conformance, fuzz or CI run. No child process left running. No shared RESUME/decision/performance/backlog-order files changed.

Proposed tests after this phase (owner picks):
- Both literal Hero cross-build commands above after ZN-334 supplies FFmpeg (minutes cold, seconds to the current missing-sysroot error warm; memory unmeasured). Inspect ARMv7/NEON/hard-float metadata on both outputs; required for remaining AC1.
- Real CHIP/PocketCHIP short Hello/Hero and display/touch/keyboard/GPIO/battery checks (seconds each, memory unmeasured); no existing hardware proof is implied.
- Broader profile screen/default/explicit project-window coverage across the other existing profiles and exported QuickJS bundles (seconds to minutes; memory unmeasured). Current direct all-three-engine CHIP/PocketCHIP checks already pass.

Proposed later.md line: - ZN-513: Validate CHIP/PocketCHIP display/input/GPIO/power and T2 asset budgets on actual boards after the ARMv7 sysroot work; capability rows and ELF metadata do not certify hardware.

ZN-334 integrated c0bb1ba9e after ZN-1121 d3fc22b57. Both unchanged Hero literal cross-builds now pass with verified pinned FFmpeg sysroot; each ARMv7 hard-float/NEON ELF is 11006600 bytes, SHA256 26360e2733e93d6081e2efb813885bc51e4ad97f1b60feff70db51ae0eb5aa6e. No target execution or hardware behavior claim. AC1 passes; all five criteria checked.
<!-- SECTION:NOTES:END -->
