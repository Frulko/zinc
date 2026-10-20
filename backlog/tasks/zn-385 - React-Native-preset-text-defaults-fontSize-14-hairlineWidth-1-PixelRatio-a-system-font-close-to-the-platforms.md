---
id: ZN-385
title: >-
  React Native preset: text defaults (fontSize 14), hairlineWidth = 1 /
  PixelRatio, a system font close to the platform's
status: Done
assignee: []
created_date: '2026-10-08 19:43'
updated_date: '2026-10-08 22:57'
labels:
  - ui
  - rn
  - fonts
  - size-S
milestone: m-17
dependencies: []
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the RN port spike (ZN-290, docs/reports/rn-port-spike.md): React Native's Text defaults to fontSize 14 (zinc:ui 16), StyleSheet.hairlineWidth is 1 / PixelRatio (here 1 logical px), and iOS / Android draw with San Francisco / Roboto where zinc:ui uses Inter. Under the react-native preset: default text 14 px, hairlineWidth from the pixel scale; pick a metric-close open face for the system font (Roboto is Apache-2.0; SF cannot be shipped) as an option.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a Text without fontSize is 14 px in the preset and 16 px elsewhere; hairlineWidth is 0.5 at pixel scale 2 (test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: under the react-native preset a Text without fontSize is 14 px (DEFAULT_TEXT in zinc:ui; the baker adds 14 px under the preset), 16 px elsewhere. StyleSheet.hairlineWidth is React Native's: 0.4 rounded to the device pixel, else 1 / PixelRatio (1, 0.5, 1/3 at scales 1, 2, 3); a width or height between 0 and 1 keeps one pixel of layout. Headless runs honour ZINC_SCALE=1..4 (it was read nowhere; no test used a value above 1). System font: documented as the app's own Roboto + ui.setFontSans (ZN-379), not vendored. Test tests/t1/rn_text_defaults.sh; rn-tester hashes and screenshots re-recorded (14 px text); all RN T1 tests pass; tests/run --changed 50/50. usage: n/a
<!-- SECTION:NOTES:END -->
