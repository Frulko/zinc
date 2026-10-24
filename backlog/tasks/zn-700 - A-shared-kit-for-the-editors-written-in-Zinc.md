---
id: ZN-700
title: A shared kit for the editors written in Zinc
status: Backlog
assignee: []
created_date: '2026-10-10 21:52'
labels:
  - ui
  - editor
  - size-M
dependencies: []
ordinal: 16600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pinball table editor copied its widgets, its document and undo pattern, its string table and its test helpers from the museum storyboard editor. A shared module (document with operations and undo by copies, the bilingual string table, panels, number fields, lists, the go-to and find boxes, the scripted-session helpers) used by both.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 both editors import the kit and their tests pass unchanged
- [ ] #2 a third editor of 200 lines is built on it as an example
<!-- AC:END -->
