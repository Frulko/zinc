---
id: ZN-512
title: 'armv7-linux: NEON in -mcpu and its checks'
status: Review
assignee: []
created_date: '2026-10-09 07:40'
updated_date: '2026-11-10 13:56'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-132
ordinal: 52900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Set -mcpu=cortex_a8+neon (and VFPv3) at src/tc/tc.cpp:199; readelf -A row in tests/t2/cross_linux.sh listed in later.md Cross-platform pass.

**What is left (review 2026-10-25):** Add +neon (and VFPv3) to the armv7-linux -mcpu, check with readelf -A in cross_linux.sh; drop the static-musl and CHIP-03 criteria. Already there: src/tc/tc.cpp:195; src/cli_core.cpp:1041.

Add armv7-linux to src/tc (targets(), crossBuild, ensureCrossLibs wrappers, plugin_build crossArch): zig target arm-linux-musleabihf, -mcpu=cortex_a8+neon (zig's cortex_a8 model has no NEON/VFP3 by default), -static, -O2 -ffp-contract=off. Static musl runs on NTC 4.4 jessie (glibc 2.19), Debian trixie, OpenWrt and Buildroot; zig's default glibc for 32-bit Arm is 2.34. dynlib is false (no dlopen). Measure -mthumb against -marm. See docs/reports/hardware/ntc-chip.md 3.5 and 9.1. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc build --target armv7-linux hello.ts produces a static ELF32 ARM EABI5 hard-float executable with no NEEDED entries
- [x] #2 readelf -A shows Tag_CPU_arch v7, Tag_FP_arch VFPv3 and Tag_Advanced_SIMD_arch NEONv1
- [ ] #3 examples/hero and examples/bouncing-ball link with the graphics host (null HAL) for armv7-linux; sizes recorded for -marm and -mthumb
- [ ] #4 hello prints the same output under qemu-arm -cpu cortex-a8 as on the host (Linux CI; on macOS through CHIP-03)
- [x] #5 tests/t2/cross_linux.sh covers the new target
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. armv7-linux exists (src/tc/tc.cpp:195, zigTargetFor chip/rpi2 -> armv7-linux, glibc 2.28 not static musl). Left: add +neon to -mcpu (flag is cortex_a8 only), a readelf check and tests/t2/cross_linux.sh row. Evidence: src/tc/tc.cpp:195; src/cli_core.cpp:1041
Review 2026-11-07: rewrite. Only +neon in -mcpu and a readelf row remain; one-line change, the cross build proof waits for the pass. Evidence: src/tc/tc.cpp:199 (-mcpu=cortex_a8)

Worker 2026-11-10: implemented the explicit November 7 review scope. `armv7-linux` now uses `-mcpu=cortex_a8+neon`; its existing `arm-linux-gnueabihf.2.28` triple stays unchanged. The original acceptance text is preserved: AC1's static/no-NEEDED clause, AC3's graphics/thumb comparison and AC4's QEMU execution are not proven and were excluded by the review. Review status records that mismatch; this is not a static-musl migration or a hardware execution claim.

Research: [pinned Zig 0.15.2 ARM features](https://github.com/ziglang/zig/blob/0.15.2/lib/std/Target/arm.zig#L867-L873) makes NEON depend on VFPv3 (which implies VFPv2 and D32), so adding `+vfp3` is redundant. [Arm build attributes](https://github.com/ARM-software/abi-aa/blob/main/addenda32/addenda32.rst) distinguish CPU/FPU/SIMD features and VFP arguments; [ELF for Arm](https://github.com/ARM-software/abi-aa/blob/main/aaelf32/aaelf32.rst) defines the linked executable's hard-float flag. No dependency was added.

Callers checked: the console cross build and packaged native fallback both use `crossBuild`; the graphics wrapper and plugin cross compiler read the same target row and already key their caches by target flags. The console runtime cache did not: it could reuse pre-NEON objects. Its source key now hashes the source digest plus complete compile flags before the existing truncation; the header key is unchanged. `tc_cache` exercises the actual CLI/compiler-invocation boundary with a private fake Zig and two source-root aliases: 11 cold compilations, zero on an unchanged build, 11 after include flags change, disjoint object filenames. It also checks the exact CPU flag and unchanged target triple. No shared cache was changed.

Proof (private `.logs/zn-512/`): `tools/build zinc` succeeded; existing third-party and `src/agent/dev.cpp` warnings remain, none in the changed toolchain code. `tests/run --only tc_cache` passed, as did its direct bounded replay and shell syntax/diff checks. `zinc check` accepted a console hello. Installed, pinned Zig 0.15.2 compiled a double-add C object with the exact target/CPU flags and `-O2 -ffp-contract=off`; GNU readelf shows ELF32 ARM, CPU v7, VFPv3, NEONv1 and `Tag_ABI_VFP_args: VFP registers`. The real Zinc hello cross build succeeded offline in a private `ZINC_HOME`: 10,486,940 bytes, SHA-256 `3c2b635abe6125802ab2bc92e8eda8dfd8b28ef5e990a3f85be1ee9c23dccb59`, ELF32 ARM EABI5 hard-float, `/lib/ld-linux-armhf.so.3`, with NEEDED libraries. Its `-A` attributes confirm v7/VFPv3/NEONv1; its runtime machine.cpp object confirms VFP-register arguments. LLD omits that argument attribute in the linked executable, so the deferred row checks executable `e_flags` rather than falsely requiring an object-only attribute there. No ARM executable was run.

AC2 passes on the real executable; AC5 is implemented in `tests/t2/cross_linux.sh` with the `armv7-linux:2800` row and GNU `readelf -A/-h` assertions (`READELF` chooses its path). The three-architecture graphics T2 harness was not run. Every app/test/compiler proof was bounded through the coordinator's `tools/work-run`; no worker process remains.

Coordinator proposals: no new architecture decision or performance measurement. Cross-platform pass line: `ZN-512: run cross_linux with GNU READELF at the owner-chosen milestone; the Cortex-A8 ELF metadata is proven locally, graphics linking and execution remain unproven.`

Proposed tests: `READELF=<GNU readelf> ZINC=build/zinc tests/run --only cross_linux` (three graphics cross builds and final ELF attributes; several minutes cold, memory unmeasured); a short console hello on an available compatible ARM machine (seconds, memory unmeasured). No suite, Hero/thumb comparison, QEMU, benchmark or physical-device proof was attempted. Usage: n/a.
Coordinator root2d1bb151e/compiler0523dc12 passes exacttc_cache, verifies realobject/ELF hashes and independently re-reads ARMv7/VFPv3/NEON/EABI5 hardfloat attributes. ReviewAC2/5 only, no execution/staticmusl claim. Durable .logs/archive-completed-workers-20261110/512-final.

<!-- SECTION:NOTES:END -->
