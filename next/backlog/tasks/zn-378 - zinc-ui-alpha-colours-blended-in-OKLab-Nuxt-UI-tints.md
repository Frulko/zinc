---
id: ZN-378
title: 'zinc:ui: alpha colours blended in OKLab (Nuxt UI tints)'
status: Backlog
assignee: []
created_date: '2026-10-08 18:48'
labels:
  - ui
  - style
  - size-S
milestone: m-17
dependencies: []
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap found by ZN-357.01 (docs/nuxt-ui.md): Nuxt UI's tints (bg-primary/10, ring-primary/25, text-primary/75) are color-mix in OKLab over the page; zinc:ui blends alpha in sRGB, close but not identical. Option: an opt-in OKLab mix for a colour with alpha over a known background, evaluated when the style is applied (no per-pixel cost).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a soft badge and an outline button match a browser capture of Nuxt UI within 1 per channel
<!-- AC:END -->
