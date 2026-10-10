---
id: ZN-674
title: 'imageFromBytes: WebP and GIF'
status: Backlog
assignee: []
created_date: '2026-10-10 19:21'
labels:
  - gfx
  - assets
  - size-S
dependencies: []
ordinal: 430410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) imageFromBytes decodes PNG and JPEG only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a WebP and a GIF decode at run time on the interpreter and the AOT (test)
- [ ] #2 the size added to a built program is measured
<!-- AC:END -->
