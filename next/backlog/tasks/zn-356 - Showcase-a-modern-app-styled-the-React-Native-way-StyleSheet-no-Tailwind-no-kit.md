---
id: ZN-356
title: >-
  Showcase: a modern app styled the React Native way (StyleSheet, no Tailwind,
  no kit)
status: Backlog
assignee: []
created_date: '2026-10-08 14:58'
labels:
  - ui
  - examples
  - style
milestone: m-17
dependencies: []
ordinal: 50779
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: a complete demo that shows zinc:ui styled like React Native, with its own modern visual language (not shadcn, not lib/std/kit): StyleSheet.create and style={{...}} objects only, no class strings; zinc.json "ui": {"layout": "rn"} (Yoga); own design tokens (colour, type scale, radii, elevation, spacing) in one theme module with light and dark; screens that exercise the style system: a feed with cards and images, a detail view with a hero header, a settings list with switches and a sheet, a chart card; motion with transitions. examples/rn-showcase, README with screenshots. Reports which RN style props are missing (each a task).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/rn-showcase runs with zinc run (rn layout), uses no class string and no lib/std/kit import (a check in its test)
- [ ] #2 every screen has a headless golden frame in light and dark
- [ ] #3 the README lists the React Native style properties used, and a task exists for each one zinc:ui lacks
<!-- AC:END -->
