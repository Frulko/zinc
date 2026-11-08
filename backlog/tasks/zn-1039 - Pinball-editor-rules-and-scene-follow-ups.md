---
id: ZN-1039
title: 'Pinball editor: rules and scene follow-ups'
status: Backlog
assignee: []
created_date: '2026-11-07 16:38'
labels:
  - pinball
  - ui
  - size-M
milestone: m-27
dependencies: []
ordinal: 1031000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small features and defects of the table editor listed under ZN-649.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-649.14: a rule of a pinball table can listen to the plunger, so a skill shot needs no hidden sensor.
- ZN-649.14: narrow a rule's `event` by its `on` (and multiball's `jackpotOn`/`jackpotEvent`); it changes every session that chooses an event.
- ZN-649.14: a deletion could hand the rules to another thing of the same kind; a list `do` on a mission; lights or elements chosen by a click on the top view; a renamed counter is not renamed in the rules that use it; the scores grid needs a horizontal scroll under 1440 wide.
- ZN-649.17: a table or package dropped on the window could join the list (zinc:system `drop`); free the scene and sounds of the table that leaves.
- ZN-649.16: keep the editor's mirror axis and view with the table folder; today they are recomputed at each open.
- ZN-649.16: Save as and Open a package have no button (a button changes every golden frame of the top bar); the file-dialog path and the refusal of entry names that leave the folder (`..`, absolute) have no test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A rule can listen to the plunger; a rule event is narrowed by its on; deleting a thing hands its rules to a same-kind thing
- [ ] #2 A renamed counter is renamed in the rules; the scores grid scrolls under 1440 px
- [ ] #3 Dropping a table or package on the window joins the list; the leaving table frees scene and sounds
- [ ] #4 The editor mirror axis and view are saved with the table folder; Save as / Open package have a path test
<!-- AC:END -->
