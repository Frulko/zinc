---
id: ZN-671
title: >-
  examples/nuxt-ui: the trash-2 icon is silently missing (the pinned Lucide set
  names it trash)
status: Backlog
assignee: []
created_date: '2026-10-10 19:06'
labels:
  - ui
  - bug
  - size-S
dependencies: []
ordinal: 5600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum editor (ZN-650.07): examples/nuxt-ui/zinc.json lists the icon trash-2, which the pinned Lucide set no longer has (it is trash), so that icon draws nothing and nothing says so. Rename it in the demo, and make a missing icon name of zinc.json a build warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the icon draws in the nuxt-ui demo (pixel golden updated with the reason)
- [ ] #2 an unknown icon name in zinc.json gives one warning naming it
<!-- AC:END -->
