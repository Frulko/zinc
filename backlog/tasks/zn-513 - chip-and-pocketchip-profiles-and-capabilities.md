---
id: ZN-513
title: 'chip and pocketchip: capabilities rows and docs'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
updated_date: '2026-11-10 16:43'
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
- [ ] #1 zinc build --target chip and --target pocketchip build hello and hero
- [ ] #2 zinc:platform exposes PROFILE, SCREEN_W/H, TOUCH, KEYBOARD, GPIO, POWER for both profiles
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

<!-- SECTION:NOTES:END -->
