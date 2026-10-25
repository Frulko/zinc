---
id: ZN-835
title: 'reMarkable: model rows for Move and Paper Pure, rM2 through rm2fb'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 15:10'
updated_date: '2026-10-25 15:35'
labels:
  - remarkable
  - size-M
milestone: m-11
dependencies: []
ordinal: 544460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
§10 of docs/reports/remarkable-bridge-design.md and remarkable-apps-design.md: plugins/display-rmpp/models.h rows (codename, geometry, stride, input ranges, vendor hash -> swap symbol and mode mapping, xochitl unit limits) for the Paper Pro, Move and Paper Pure; the rM2 through rm2fb (timower) instead of a bridge of our own.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 models.h holds one row per model; an unknown model or vendor hash falls back to L0 with one message naming it
- [x] #2 the rM2 runs through the rm2fb client path, selected by its row, with the fake qtfb/rm2fb harness proving the choice on the Mac
- [x] #3 a new OS or model is one table row: docs/targets say how to add one after a tablet test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done on the Mac (worktree agent).
- models.h: rows for the Paper Pro (Ferrari), Move (Chiappa, 954x1696, qtfb fmt 4, vendor buffer 960x1696/3840), Paper Pure (Tatsu, 1404x1872, fmt 7, vendor buffer unknown) and reMarkable 2 (rm2fb, pen rotated 90); vendors: Paper Pro 3.27.3.0 only (3800e9...). Move/Pure unit limits assumed 4/600/60 until read on a tablet.
- rm2fb.h: client of timower's rm2fb (stream socket /var/run/rm2fb.sock, Init -> FbFormat + fd by SCM_RIGHTS, RGB565, UpdateParams with DU for ink / GC16_FAST for UI, bool ack), chosen by the rM2 row; evdev touch; no lane or session on the rM2 (one message when ink is asked).
- Proof: tests/t1/rmpp_sim.sh PASS (19 s): move -> 'init key 7 fmt 4 (RGB888 954x1696)'; pure -> fmt 7 and 'vendor library 3800e9f3... is not verified for the Paper Pure' once; rm2 -> 'rm2fb init own 0 format 1404x1872/0', 'rm2fb update 0,0 1404x1872 GC16_FAST', no qtfb init, no lane hello; rm2 without rm2fb -> 'reMarkable 2: rm2fb is not running' and headless; unknown model -> one message (ZN-834 run).
- docs/targets/remarkable-paper-pro.md 'Models, and adding a model or an OS': the table and the steps for a new OS row (after a tablet test) and a new model row.
- Not provable on the Mac: the rM2 armv7 build (cross-platform pass), real rm2fb against a tablet, Move/Pure vendor hashes and evdev ranges.
<!-- SECTION:NOTES:END -->
