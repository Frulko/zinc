---
id: ZN-374
title: 'Icons: Lucide vendored, <Icon name size color strokeWidth /> through zinc:svg'
status: Done
assignee: []
created_date: '2026-10-08 15:22'
updated_date: '2026-10-08 15:30'
labels:
  - ui
  - icons
  - examples
milestone: m-17
dependencies: []
ordinal: 50055
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08 (rn-showcase): no icon library. Vendor Lucide (ISC licence, pinned release, third_party/README.md row) as SVG sources; an Icon component (zinc:ui and zinc:react-native) drawing with the svg plugin (ThorVG): name, size, color (currentColor), strokeWidth, absoluteStrokeWidth; only the icons a program names are baked (tree-shaken at compile time like fonts). Check the svg subset covers Lucide's strokes (round caps and joins, arcs); add what is missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/rn-showcase uses icons in its tab bar, cards and settings (goldens updated)
- [x] #2 a program naming 3 icons bakes only those 3 (size check in a test)
- [x] #3 every Lucide icon renders without an svg parse error (a test over the set)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: Lucide 1.47.0 vendored (third_party/lucide: icon-nodes.json, LICENSE ISC, PIN with the archive sha256; a release older than two weeks on purpose), README row. The frontend generates zinc:icons/lucide per program (src/frontend/modules.cpp lucideModuleSource, also served to QuickJS): the icons named by <Icon name="x"> and icon('x') in the project's .ts/.tsx files and zinc.json "icons" (["*"] for all), as SVG documents with COUNT and NAMES. lib/std/icons.tsx: Icon (canvas + zinc:svg, size, color as a function, strokeWidth), icon() cached per colour and width, iconNames(). tests/t1/icons.sh: a program naming 3 icons compiles exactly those 3 (NAMES), frame hash of their drawing, unknown name -> null; all 1848 icons parse with shapes (1.4 s). rn-showcase uses icons in the tab bar, the likes, the back button and the settings rows (names passed through props listed in its zinc.json); its 11 hashes regenerated, screenshots updated. docs/ui.md Icons section.
<!-- SECTION:NOTES:END -->
