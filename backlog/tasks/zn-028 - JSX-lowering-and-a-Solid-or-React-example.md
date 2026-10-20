---
id: ZN-028
title: JSX lowering and a Solid or React example
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 15:12'
labels:
  - size-L
milestone: m-5
dependencies: []
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: one example screen matches its pixel golden in interpreter and AOT.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 JSX of a .tsx source lowers to the zinc:ui helper calls (Solid and React model) and a screen built against a recording stand-in matches its golden tree; bad JSX is a diagnostic
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope split: the pixel-golden UI screen in interpreter and AOT needs the whole zinc:ui stack compiled by the new engine and the host linked into AOT programs; those moved to ZN-044 and ZN-045. Done here: src/frontend/jsx.cpp (port of compiler/src/jsx.ts for tags, attributes, text, components, fragments, Show/For, &&, ?:, map; not yet: style attribute, VirtualList, React class components, class-name and hook checks), checker: callbacks with fewer parameters than expected, generic inference through a lambda's result.
<!-- SECTION:NOTES:END -->
