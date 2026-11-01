---
id: ZN-936
title: 'Tiny int8 CNN letter model and kernels for zinc:ink'
status: Backlog
assignee: []
created_date: '2026-11-01 12:13'
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
- [ ] #1 C logits match Python within 1 LSB on 50 inputs
- [ ] #2 Held-out letter accuracy beats the $Q stage by >= 2 points and one group infers in <= 5 ms natively on the Mac
<!-- AC:END -->
