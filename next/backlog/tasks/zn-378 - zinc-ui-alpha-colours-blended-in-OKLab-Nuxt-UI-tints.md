---
id: ZN-378
title: 'zinc:ui: alpha colours blended in OKLab (Nuxt UI tints)'
status: Done
assignee: []
created_date: '2026-10-08 18:48'
updated_date: '2026-10-08 21:59'
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
- [x] #1 a soft badge and an outline button match a browser capture of Nuxt UI within 1 per channel
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: measured first: Tailwind 4's color-mix(in oklab, c a%, transparent) keeps the colour and changes only the alpha, so the gap was not OKLab but zinc:ui's 8-bit blend (alpha 26/255 for /10 and a rounding down: 1-2 per channel darker). zinc:ui/nuxt's mix(c, alpha, over) composites like the browser (float alpha) and the kit uses it for every tint on the page; rings over the element's own tint (subtle buttons and badges, checked cards) stack as the browser draws them (ringOn). tools/oklab-tints renders the cases in headless Chrome (tools/cdp.py) and in zinc: worst difference 1 on 18 cases including stacked rings (tests/t1/oklab_tints.sh, 77 without Chrome). Nuxt UI hashes and screenshots re-recorded. The raster's own blend is unchanged (prototype pixels). tests/run --changed 44/44.
Limit: a tint over a surface other than the page (inside an elevated card) composites against the page colour.
<!-- SECTION:NOTES:END -->
