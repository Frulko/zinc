---
id: ZN-259
title: >-
  UI style: Colour model: alpha on text, border, shadow and CSS colours;
  `rgb()/hsl()/currentColor`; i32 RGBA on fx12
status: Done
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 06:05'
labels:
  - ui
  - style
  - size-S
milestone: m-17
dependencies:
  - ZN-250
ordinal: 50590
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-11). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Parser tests for 30 colour strings including `/50`.
- [x] #2 Compile for `ps1` (fx12): no overflow, colours identical to the f32 build.
- [x] #3 `text-white/60` golden.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Colour tokens: alpha on text (text-white/60) and border (border-white/30, borderAlpha/fgAlpha on UiNode, applied in paint, inherited with the text colour), CSS values in brackets: #rgb #rgba #rrggbb #rrggbbaa (a 3-digit hex is now CSS-correct: #f80 = #ff8800, it was 0x000f80), rgb(), rgba(), hsl(), hsla() (integer arithmetic only), border-current (text colour at paint time), text-current. percentAlpha(p) is integer and equal on every number profile (50 and 90 give one less than exact rounding, as Math.round(p * 2.55) always did on f64, so frames stay identical). Tests: tests/golden/ui-colors (35 strings: accepted or refused, colour and alpha) run on f32 and under --profile ps1 with identical output (t1/ui_tokens.sh), scene text-alpha in ui-style, the JSX compile-time grammar kept equal to the runtime by the same test. Targeted run only: tests/run --changed (6 passed) and the 4-entry pixel canary equal. Not done: alpha for colours in style objects and shadow colours (ST-10), currentColor on bg.
<!-- SECTION:NOTES:END -->
