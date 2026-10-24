---
id: ZN-486
title: 'Console bench: per-frame JSONL, tape replay and the bouncing-ball ball count per console'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies: []
ordinal: 50200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Reuse tools/zbench and the console input scripts: a JSONL record per frame (CPU, GPU wait, late frames, heap), a summary (p50/p99/worst), bouncing-ball max ball count at 60 fps with a 90 percent gate on PSP, Vita and 3DS; emulator numbers labelled emulator. Docs/reports/handheld-perf.md holds receipts.

One harness for every handheld target: input tapes (frame, buttons, analog, touches) baked into a capture build, a fixed camera route for 3D demos, and per-frame records (CPU work, GPU wait, vblanks, late frames against the period, triangles, draws, heap high-water) written as JSONL to the host (stdout on emulators, host0:/USB/LAN on devices). Receipts carry build hashes and mark emulator numbers as not hardware. Replaces ad-hoc timing in each target. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc bench --target psp --tape <file> produces a JSONL log and a summary (frames, late, worst, p50/p99) from PPSSPPHeadless
- [ ] #2 The schema is documented and versioned; vita, n3ds and ios-legacy targets reuse it
- [ ] #3 A replayed tape gives byte-identical goldens on two runs
- [ ] #4 Emulator receipts are labelled emulator and never compared with hardware budgets
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Bench and tape harness for the consoles: ZINC_PROFILE frame times and pad scripts exist, but no JSONL per-frame record, summary or ball-count gate. Absorbs 463, 464 and 465 (max ball count at 60 fps). Evidence: tools/console-demos --input; ZINC_PROFILE in docs/targets/handhelds.md; no zinc bench --target
Review 2026-10-25: merged ZN-463 here (PSP: bouncing-ball with the software raster and a GE copy). Carry over: Software raster on PSP runs bouncing-ball (breakout/bouncing-ball in PPSSPP, GE replay since 27202ba5); only the recorded ball count and gate are left, shared with 464/465. ZN-486 is open and is the receipts/gate harness; carry over bouncing-ball's max ball count at 60 fps and the 90% gate. docs/reports/handheld-perf.md (named in AC3) does not exist; the emulator proof in console_emulators.sh is breakout's pad session, not bouncing-ball, so carry the bouncing-ball golden too.
Review 2026-10-25: merged ZN-464 here (Vita: bouncing-ball with 3-core band raster). Carry over: Same remaining work (ball count at 60 fps and a gate) as ZN-463 for the Vita; Vita hardware already measured on Meadow Run (60 fps, none missed). The 3-core band raster is superseded by GXM (D151); carry over the Vita ball count with 90% gate and the logic/raster/present split into ZN-486.
Review 2026-10-25: merged ZN-465 here (3DS: bouncing-ball on the top screen). Carry over: 3DS bouncing-ball runs in Azahar (600 balls pixel-identical on the PICA); only the recorded ball count and gate remain. Carry over Old/New 3DS ball counts with 90% gate (hardware: later.md:681 line) and the RetroArch screenshot into ZN-486.
<!-- SECTION:NOTES:END -->
