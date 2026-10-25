---
id: ZN-839
title: 'reMarkable: in-xochitl Pen-mode ink canvas, no xochitl restart'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-25 18:57'
labels:
  - remarkable
  - size-L
milestone: m-11
dependencies: []
ordinal: 548460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Route 2 of docs/reports/remarkable-fast-ink-landscape.md (owner 2026-10-25: the best, fastest, best integrated ink): a XOVI extension adds a painted Qt item inside xochitl under its QML Pen screen mode (xofm.libs.epaper), fed by the app's qtfb shared memory with update(rect), so a Zinc app gets the handwriting waveform while xochitl keeps running. Plus the lease reopening the last document after an L2 session (rm-hacks-qmd approach).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a XOVI extension (exported Qt symbols and xochitl QML types only, no native engine addresses) shows an AppLoad app's qtfb strokes through xochitl's Pen mode on the stroke's rect; it fails closed (stays off with one journal line) on an unknown OS hash
- [ ] #2 display-rmpp selects it as the ink layer when present (ink: native), with the existing downgrade to plain qtfb
- [ ] #3 the lease reopens the document xochitl had open before an L2 session, or says why it could not
- [ ] #4 proven on the Mac (build in the SDK container, the fake-xochitl harness extended); the tablet steps written in docs/targets/remarkable-paper-pro.md
<!-- AC:END -->
