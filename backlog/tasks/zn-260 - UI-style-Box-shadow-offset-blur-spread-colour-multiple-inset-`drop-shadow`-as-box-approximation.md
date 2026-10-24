---
id: ZN-260
title: 'Box shadow: several layers, inset, spread'
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-174
  - ZN-259
ordinal: 6900
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** shadow-sm..xl stay bit-exact; add layered and inset shadows (`shadow-[...]`, `inset-shadow-*`) with goldens; degrade past 2 layers / blur 8 px on small profiles with a log line.

From docs/reports/ui-style-system.md (section 6, ST-10). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `shadow-sm..xl` bit-exact with today.
- [ ] #2 Goldens of two-layer and inset shadows; GL analytic blur within tolerance.
- [ ] #3 T0: more than 2 layers or blur > 8 px degrade as specified (test) and inset drops with a log line.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Presets and RN shadows shipped; multiple, inset and spread shadows did not. Evidence: lib/std/ui.ts:961 shadow levels, RN shadows (abe45f10), tests/t1/style_shadow.sh; no inset or multi-layer
<!-- SECTION:NOTES:END -->
