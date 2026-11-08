---
id: ZN-1022
title: 'Classic layout: CSS conformance of 100% sizes, basis, shrink and flex-1'
status: Backlog
assignee: []
created_date: '2026-11-07 16:36'
labels:
  - layout
  - ui
  - size-M
milestone: m-17
dependencies: []
ordinal: 7300
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the classic layout `h-full`/`w-full` along the main axis grows past its parent, a row child with `basis-N` is measured for the offered width, a growing column never shrinks below its content, and a plain `flex-1` grows from content width instead of `flex: 1 1 0%`. Fix and re-record the affected goldens in one commit with a list of what moved.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-737: `h-full` / `w-full` along the main axis grows past its parent in the classic layout (CSS: 100%); fixing it in the core moves pixels and needs the prototype goldens. hero's shell was the case seen (fixed there with `absolute inset-0`).
- ZN-737: a row child with `basis-N` is measured for the offered width, not its basis (scroll range 30 for 170 on a probe).
- ZN-737: the classic layout never shrinks a growing column whose content is wider than its siblings leave (310 px in a 220 px slot).
- zinc:ui classic: a plain `flex-1` (without `min-w-0`) still grows from its content width, not Tailwind's `flex: 1 1 0%` (`flex-1 min-w-0` works since f3dc85238); align it and rerun the layout goldens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 four probes lay out as in Chrome (tools/layout-fixtures)
- [ ] #2 layout-fuzz shows no new difference
- [ ] #3 changed goldens listed in the commit, hero and nuxt-ui frames reviewed
<!-- AC:END -->
