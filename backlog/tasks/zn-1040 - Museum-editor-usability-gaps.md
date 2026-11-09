---
id: ZN-1040
title: 'Museum editor: usability gaps'
status: Review
assignee: []
created_date: '2026-11-07 16:38'
updated_date: '2026-11-09 09:40'
labels:
  - museum
  - ui
  - size-M
milestone: m-27
dependencies: []
ordinal: 13800
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
- [x] #1 The table lays out above the button rows at the two larger text sizes; editor offers accessibility.descriptions and plays one
- [x] #2 Staff summary shows a week and a month; the attract loop shares mesh and texture
- [x] #3 Refusal messages use the author words; editor problems panel reports a missing theme font or logo; the project opened by a relative path shows all families
- [x] #4 Multi-selection drags together; menu items enable and disable; narration bar shows cues
- [ ] #5 museum_editor T1 still passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Engine gap met (Fill the engine's gaps): an optional chain did not short-circuit as a whole (`views.twin?.viewers.get(id)` refused with Z0107: the link after `?.` was checked on `T | null`), and `m?.get(k) ?? d` crashed with a null reference when there was no Map (the Map.get fast path of `??` ignored the `?.`). Fixed: the parser marks the links after a `?.` of the same chain (kFlagChain), the checker reads such a link as `?.` when its receiver is null only because the chain may stop there (TypeScript's short-circuit; a member that may itself be null, or a chain closed by parentheses, is still refused), and the `??` lowering tests the Map first. T0 tests/t0/optional_chain.sh (interpreter, native, QuickJS = Node's output; the two refusals). PASS optional_chain, ts_assignability, optional_unknown_undef.

Table (AC1 first half, AC2): src/table.ts lowest/fit and src/stage.ts layOut: when the rows at the visitor's edge rise over the lowest card as designed, the cards are laid out smaller and nearer the far side about the middle of the far edge (s = (edge - 12) / lowest, at least 0.5; 1 when nothing overlaps, so the designed size and its goldens do not move); a card the visitor moved keeps its place among the others. Seen at 1.6 on ukiyo-e: every card above the rows. Staff summary (src/stats.ts last/firstDay, player.ts): three tabs, the day, the last 7 days, the last 30 days (their files added up); a touch elsewhere closes; seen on three day files (6 visits over 30 days). Attract loop: the visit's and the loop's Views are twins (stage.ts Views.twin): a viewer or a lookout of a medium the twin holds shares its body Node (meshes, OBJ texture, glTF materials) or its sphere and picture; only the maker frees them. Seen: 'object vase shared', 'sphere shared', the pins of the shared vase in place.

Editor (AC1 second half, AC3, AC4), examples/museum-table/editor: Project settings > Accessibility sets accessibility.descriptions (doc.setDescriptions, undoable); a medium's panel has "Listen to the description" (spokenDescription of src/; the status says when there is no path). Seen: listen kanbara-snow audio/descriptions/kanbara-snow.fr.mp3 11.5 s, playing. Refusals (state.ts refusal) turn the loader's path (media[i].caption.en, sequences[i].items[k]...) into the author's words: "The medium "Neige du soir à Kanbara": the caption in English is missing." Problems panel: a theme font, title font or logo that is not in the project folder is a warning that opens the theme settings (missingThemeFiles; the families sans, sans-bold, mono are not files). A project opened by a relative path is resolved against the launch directory (zinc:path resolve), so folder() lists its fonts: seen with examples/../.scratch/proj/project.json, JetBrainsMono in the live sample. Several selected media or sequences drag together, one undo step each ("Move media", "Move sequence"; tools.ts moveChosen); a click on one of them without a drag selects it alone. Menu items carry enabled (cut, copy, duplicate, delete with a selection, arrange with two or three, zoom on the storyboard, undo, redo, save); setApp is sent only when the menu changes (seen three times: none, one, two selected). The narration bar of the timeline shows its cues (cuesOf: the subtitles, or the transcript at a reading pace), a block per cue with its first words: seen on ukiyo-e.

Web search (sonnet sub-agent): Figma, Keynote and PowerPoint move a multi-selection as one gesture with one undo step and select one member on a click without a drag (done so); the macOS HIG wants menu items disabled rather than hidden when they do nothing (done); Premiere and DaVinci show subtitles as blocks on their own track, Descript shows the words on the clip (here on the narration bar); error messages name the object and the field in the user's words, not the data path (NN/g error message guidelines); TypeScript's optional chain short-circuits the whole chain (TS 3.7 release notes), which the engine now does.

Proposed decision (for the coordinator to number): the museum table fits the cards above the button rows by scaling the designed layout about the middle of the far edge, (edge - 12) / lowest card, never below 0.5, and only when the rows overlap; the designed size stays pixel identical. Rejected: reflowing the cards (it changes the author's composition) and shrinking the rows (the buttons keep the size a finger needs).

Lines for backlog/later.md: ZN-1040: a film in the editor (poster, loop, subtitles) has no preview of its own; a default statistics directory for packaged tables; a visit under way at switch-off is not counted; storyboard miniatures ignore rotation; table.visitors is read nowhere; lengthOf keeps a replaced file's length until reopening; a real macOS check of the native menu enabled states and of drag and drop; a rubber band selection on the table and the storyboard; pasting a medium into a project of another folder does not copy its file; the missing-file problems do not refresh when a file leaves the folder while the project is open.

AC5 not run (an app: proposed tests, the owner picks). Proposed tests:
- tests/run --tier demo --only museum_editor: the scripted editor sessions still pass; the frames that show the timeline with a narration (table-*.png, sound-112.png) change with the cues and need regenerating; ~1-2 min, ~600 MB.
- tests/run --tier demo --only museum_editor_views, museum_editor_sound, museum_editor_tools: views, narration panel and the tools (menus, align, paste) still pass; ~1 min each, ~600 MB.
- tests/run --tier demo --only museum_stats: the summary frame golden changes with the tabs (regenerate); ~30 s.
- tests/run --tier demo --only museum_access: the card fit moves the frames of the two larger sizes (regenerate); size 1 unchanged; ~1 min.
- tests/run --tier demo --only museum_visit (and the ZN-695 story golden): the narration pause and resume still play; the attract loop with shared meshes; ~1 min.
- tests/run --only optional_chain (T0, run, PASS): the optional chain on the three engines; ~5 s.
<!-- SECTION:NOTES:END -->
