---
id: ZN-385
title: >-
  React Native preset: text defaults (fontSize 14), hairlineWidth = 1 /
  PixelRatio, a system font close to the platform's
status: Backlog
assignee: []
created_date: '2026-10-08 19:43'
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
- [ ] #1 a Text without fontSize is 14 px in the preset and 16 px elsewhere; hairlineWidth is 0.5 at pixel scale 2 (test)
<!-- AC:END -->
