---
id: ZN-930
title: 'zinc:ui Layer cache and zinc:gfx refreshRect for e-ink'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:11'
updated_date: '2026-11-01 13:43'
labels:
  - ui
  - rmpp
  - perf
  - size-M
milestone: m-29
dependencies:
  - ZN-929
ordinal: 624460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Layer component caches a subtree as an image with invalidate(); refreshRect(rect, fast|quality|full) is an additive HAL field mapped to the rmpp waveform choice (eink.h). Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An unchanged layer issues no draw commands
- [x] #2 The rmpp harness records the requested refresh mode per rect
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
layer-cache class + ui.invalidate(h) + layerRecordCount (tests/t1/ui_layer.sh, golden tests/golden/ui-layer): an unchanged layer is not recorded again and a frame draws one image command. refreshRect(x,y,w,h,'fast'|'quality'|'full') in zinc:gfx goes through the existing device query display.rect (no HAL struct change); rmpp parses it with eink::parse_hint, sends the rect (not the page) in UI or the pen's mode (set_mode without the colour-reveal repaint) or asks a full refresh; L2/RM2 set their fast flag / full_now. Harness: tests/t1/rmpp_sim.sh case rect (fixture tests/data/rmpp-refreshrect) checks mode and rect per request. Also ZINC_EINK=0 turns the e-ink mode off on a panel profile. rmpp_sim notes/dashboard/edge/dock/touch fail identically on the unmodified develop binary (pre-existing).
<!-- SECTION:NOTES:END -->
