---
id: ZN-936
title: 'Tiny int8 CNN letter model and kernels for zinc:ink'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:13'
updated_date: '2026-11-01 18:55'
labels:
  - ink
  - size-L
milestone: m-29
dependencies:
  - ZN-932
  - ZN-931
ordinal: 630460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Python training under tools/ink-train with augmentation and int8 quantization, a .znm loader and C kernels (under 150 KB). Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 C logits match Python within 1 LSB on 50 inputs
- [x] #2 Held-out letter accuracy beats the $Q stage by >= 2 points and one group infers in <= 5 ms natively on the Mac
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Net: 3 conv 3x3 (16/32/48) + 2 dense, int8, 24x24x3 input (ink, cos2t, sin2t), 48704-byte .znm, PyTorch training (tools/ink-train/train, 100 extra synthetic writers, x5 augmentation, 30 epochs), post-training per-channel int8. C kernels in plugins/ink/native/ink.abi.cpp. tests/t0/ink_net.sh: C logits vs Python on 50 inputs maxdiff 0 LSB (raster exact too); held-out letters plain: stage A 335/336 99.7, net 336/336 100.0; bent harder (inknet.py stress, 672 letters): stage A 95.4, net 99.4 (+4.0), recogniser blend 98.7 (+3.3); one group 0.38 ms native (raster+net, Mac M1 Pro). Plain held-out is saturated (A at 99.7) so the 2-point bar is measured on the stress set. Synthetic data only: real pen data is the next step (notes recorder -> ink-<writer>.json, brought off the tablet with zinc device, make-dataset --real). Also fixed circleAround taking a 2-stroke B for a circled stem.
<!-- SECTION:NOTES:END -->
