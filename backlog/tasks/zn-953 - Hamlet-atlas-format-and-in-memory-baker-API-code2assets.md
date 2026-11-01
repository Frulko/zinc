---
id: ZN-953
title: 'Hamlet: atlas format and in-memory baker API (code2assets)'
status: Done
assignee: []
created_date: '2026-11-01 13:03'
updated_date: '2026-11-01 14:22'
labels:
  - hamlet
  - demo
  - m1
  - atlas
  - perf
  - size-M
milestone: m-30
dependencies:
  - ZN-952
ordinal: 700140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The atlas is an array of CachedModel frames keyed by (kind, variant, yaw8, pose) plus a header (format version, season, W/H/S, light ramps hash). In memory first; no file yet. Keeps lit volumes and depth tests because frames are captured from the same draw calls. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bakeAtlas(def): def = list of {name, axes: {variant, yaw8, pose}, draw(axes)}; returns Atlas {header, frames[]} (module in pixel-plays, later zinc:pixel)
- [x] #2 atlas.stamp(name, axes, x, y, z) = frame.drawAt; falls back to the live draw function when the frame is missing
- [x] #3 Header lists the inputs hashed for invalidation (renderer version, ramps, palette, S/W/H, def hash); hash function unit tested
- [x] #4 Format documented in docs/reports/hamlet-roadmap-2026-11-01.md section Atlas and mirrored in a header comment of the module
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: examples/pixel-plays/src/native/atlas.ts (untracked, not committed), exported by hamlet's pixel.ts. Stamp equals the live draw at whole-pixel offsets (0 pixel, 0 depth difference); lazy bake on first use. Test: tests/t0/hamlet_atlas.sh.
<!-- SECTION:NOTES:END -->
