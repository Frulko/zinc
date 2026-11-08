---
id: ZN-1040
title: 'Museum editor: usability gaps'
status: Backlog
assignee: []
created_date: '2026-11-07 16:38'
labels:
  - museum
  - ui
  - size-M
milestone: m-27
dependencies: []
ordinal: 13800
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Open follow-ups of the museum table editor and runtime that a visitor or an author meets.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-650.10: the museum editor offers `accessibility.descriptions` and plays a description.
- ZN-650.10: at the two larger text sizes the button rows lie over the lowest cards; lay the table out above them.
- ZN-650.08: the museum editor does not play a film or offer poster, loop and subtitles.
- ZN-650.12: the staff summary shows today only (week, month); a packaged table needs a default statistics directory; a visit under way at switch-off is not counted.
- ZN-650.13: storyboard miniatures ignore item rotation, and `table.visitors` is read and unused.
- ZN-650.13: the attract loop loads the model and the panorama a second time; share mesh and texture.
- ZN-650.14: the editor's problems panel does not report a theme font or logo file that left the folder.
- ZN-650.07.06: the refusal of a default language shows the loader's field path (`media[1].title.en`); say it in the author's words.
- ZN-650.07.04: subtitle cues or a waveform on the narration's bar and a film preview in the medium's panel, so an author times items against what is said.
- ZN-650.07.04: `lengthOf` keeps a replaced file's first length until the editor restarts; look at the file's date.
- ZN-650.07.05: check the museum editor's menu bar, context menus, key equivalents and drag and drop on a real macOS window; give Undo/Copy/Paste their keys in the menu once zinc:system edit roles reach text fields.
- ZN-650.07.05: ZINC_INPUT "down" takes no modifier: Shift-click selection of the museum editor is not scripted.
- ZN-650.07.05: museum editor: drag a multi-selection together, a rubber band on the table, enabled/disabled menu items, copying a medium's file when pasting into a project in another folder.
- ZN-650.14: a museum project opened by a relative path shows only the font families in the editor's sample; make the folder path absolute.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The table lays out above the button rows at the two larger text sizes; editor offers accessibility.descriptions and plays one
- [ ] #2 Staff summary shows a week and a month; the attract loop shares mesh and texture
- [ ] #3 Refusal messages use the author words; editor problems panel reports a missing theme font or logo; the project opened by a relative path shows all families
- [ ] #4 Multi-selection drags together; menu items enable and disable; narration bar shows cues
- [ ] #5 museum_editor T1 still passes
<!-- AC:END -->
