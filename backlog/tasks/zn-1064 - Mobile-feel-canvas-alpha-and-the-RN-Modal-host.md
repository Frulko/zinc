---
id: ZN-1064
title: 'Mobile feel: canvas alpha and the RN Modal host'
status: Backlog
assignee: []
created_date: '2026-11-07 16:42'
labels:
  - ui
  - size-S
milestone: m-5
dependencies: []
ordinal: 4600
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two UI bugs of the mobile-style components.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Mobile feel: a canvas (`onDraw`, `<Icon>`) draws at full alpha inside a fading or scaled view; the navigation stack works around it for its back arrow (`Navigation.alphaOf`), the icons do not.
- Mobile feel: React Native's `Modal` positions its host with the object style `position: 'absolute'`, which the classic layout ignores: in a classic-layout app the host has no size and its outside-press dismissal fires on any press (the navigation test runs in the rn layout for it).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A canvas (onDraw, Icon) inside a fading or scaled view honours the alpha; navigation no longer needs Navigation.alphaOf
- [ ] #2 RN Modal host with object style position absolute gets its size in the classic layout and dismisses only on outside press
<!-- AC:END -->
