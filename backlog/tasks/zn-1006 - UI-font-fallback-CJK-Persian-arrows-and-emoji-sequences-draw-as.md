---
id: ZN-1006
title: 'UI font fallback: CJK, Persian, arrows and emoji sequences draw as "?"'
status: Backlog
assignee: []
created_date: '2026-11-07 16:33'
labels:
  - text
  - ui
  - a11y
  - size-M
milestone: m-17
dependencies: []
ordinal: 1700
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The UI font has no glyph fallback: CJK text draws as "?" while Arial Unicode is a system fallback, geocoding names in Persian and similar, the arrows and triangles `▸▾↑↓` show as "?", and some emoji sequences print a stray hint glyph. Add a fallback chain by script (system fonts on the desktop, a bundled subset where there is none), an accessibility need for education users with non-Latin languages.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- text: CJK text (木, き) draws as '?' in zinc:ui while Arial Unicode is among the system fallbacks (examples/trieur flashcards, Japanese deck).
- ZN-755: some geocoding names show "?" (Persian and similar letters): the bundled Inter has no glyph for them; a fallback font.
- UI fonts: no glyph fallback, so ▾▸↑↓ show as "?" in the UI font (the inspector uses + - >> << for now).
- Text: the UI font has no ▸/▾ glyphs (drawn as "?") while ▶/▼ render: a font coverage or fallback gap.
- ZN-868: emoji maps print a stray hint glyph ('ᵉʳ') for some sequences; check the shaped text tier's fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a text with Japanese, Persian and `▸▾↑↓` renders real glyphs on macOS in zinc:ui (frame golden)
- [ ] #2 a missing glyph falls back to the next font before showing "?"
- [ ] #3 the inspector can use `▾▸` again
- [ ] #4 no change in the frames of programs that use only Latin text (style-neutrality)
<!-- AC:END -->
