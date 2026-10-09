---
id: ZN-486
title: Handheld bench and input-tape harness with receipts
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-463
ordinal: 300330
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One harness for every handheld target: input tapes (frame, buttons, analog, touches) baked into a capture build, a fixed camera route for 3D demos, and per-frame records (CPU work, GPU wait, vblanks, late frames against the period, triangles, draws, heap high-water) written as JSONL to the host (stdout on emulators, host0:/USB/LAN on devices). Receipts carry build hashes and mark emulator numbers as not hardware. Replaces ad-hoc timing in each target. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc bench --target psp --tape <file> produces a JSONL log and a summary (frames, late, worst, p50/p99) from PPSSPPHeadless
- [ ] #2 The schema is documented and versioned; vita, n3ds and ios-legacy targets reuse it
- [ ] #3 A replayed tape gives byte-identical goldens on two runs
- [ ] #4 Emulator receipts are labelled emulator and never compared with hardware budgets
<!-- AC:END -->
