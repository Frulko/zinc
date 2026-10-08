---
id: ZN-356
title: >-
  Showcase: a modern app styled the React Native way (StyleSheet, no Tailwind,
  no kit)
status: Done
assignee: []
created_date: '2026-10-08 14:58'
updated_date: '2026-10-08 15:14'
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
- [x] #1 examples/rn-showcase runs with zinc run (rn layout), uses no class string and no lib/std/kit import (a check in its test)
- [x] #2 every screen has a headless golden frame in light and dark
- [x] #3 the README lists the React Native style properties used, and a task exists for each one zinc:ui lacks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: examples/rn-showcase (zinc.json ui.layout rn): theme tokens with light and dark palettes (src/theme.ts), generative covers and a chart on canvases (src/art.ts, no image files), components as JSX tags with props (Chip, Avatar, Switch, Button, Row, Option, Tab, Sheet), screens Discover, Detail, Stats, Settings and a bottom sheet; switches, sheet and scheme eased per frame. Only StyleSheet.create and style objects: no class string, no kit (checked by tests/t1/rn_showcase.sh, 7 s, with the 10 frame hashes of 5 states x 2 schemes in tests/golden/rn-showcase/hashes.txt). README with 6 screenshots, the RN props used and the missing ones as ZN-358..363 (flex shorthand/shrink/basis/alignSelf; min/max/aspect/dynamic percent; shadows/elevation; transform array; dynamic enum values like fontWeight/display; borderStyle/per-corner radii/per-side colours). Learned: a component called as a function inside an element ({Avatar(...)}) is inserted as text (its handle): use <Avatar .../>.
<!-- SECTION:NOTES:END -->
