---
id: ZN-374
title: 'Icons: Lucide vendored, <Icon name size color strokeWidth /> through zinc:svg'
status: Backlog
assignee: []
created_date: '2026-10-08 15:22'
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
- [ ] #1 examples/rn-showcase uses icons in its tab bar, cards and settings (goldens updated)
- [ ] #2 a program naming 3 icons bakes only those 3 (size check in a test)
- [ ] #3 every Lucide icon renders without an svg parse error (a test over the set)
<!-- AC:END -->
