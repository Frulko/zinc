---
id: ZN-880
title: 'zinc:ui: pictures inline in a Text (RN <Image> nested in <Text>)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 18:55'
updated_date: '2026-10-30 19:05'
labels:
  - ui
  - size-M
milestone: m-28
dependencies: []
ordinal: 574460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner report 2026-10-30: in examples/discord a custom emoji at the end of a wrapped message floats to the right on its own line, because the paragraph is cut into Text pieces and Image views in a flex-wrap row. React Native lays out an Image nested in Text inline (react-native Text docs: nested views, inline images). Fill the gap in the engine's text layout (lib/std/ui.ts runs, src/text layout, the raster/GL replay of the text), then drop the pieces() cut in examples/discord/src/components/MessageView.tsx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An <Image> inside a <Text> (React and Solid) flows with the words: it wraps with them, sits on the baseline line box, and takes its width and height
- [x] #2 setTextRuns or an equivalent API places a picture run in a text, for code that builds runs (the Discord Markdown)
- [x] #3 Same frame on the interpreter, AOT and QuickJS; a golden with a picture at a line end that wraps
- [x] #4 examples/discord draws custom emoji inside its message text instead of cutting the paragraph into a wrapping row
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent).

API: an `<Image>` child of a `<Text>` (React and Solid JSX, src/frontend/jsx.cpp) becomes a child image node and one U+FFFC in the text; lib/std/ui.ts (classic layout) turns them into picture runs at the image's measured size (picKids), wraps them with the words (wrapRuns/runsWidth), and places the image node on its run (placePics), so it paints, hit-tests and keeps its classes. setTextRuns takes a picture run: `[len, ui.pictureRun(w, h), image]` draws the image in place of those characters (they still copy as text); -1 keeps the room (a picture loading). Lines take the tallest picture's height; a picture's bottom sits on the baseline when it fits, else at the line top. No change was needed in src/text or the raster/GL replay: pictures are drawImage commands of the existing paint, the same on every engine.

Engine gap found and fixed (src/frontend/check.cpp): a conditional joining an i32 and a number took the first branch's i32 when no type was asked for, so `w += c ? anI32 : aNumber` truncated (it broke ui_runs' widths). Test: tests/t0/ternary_int_float.sh.

Choices (no D number, worktree): every line takes the tallest picture's height (ponytail: per-line heights if tall pictures in long paragraphs matter). The rn layout engine (zinc.json ui.layout "rn") ignores runs, so pictures too.

examples/discord: Paragraph is one Text with picture runs for custom emoji (big in an emoji-only message); markdown.ts pieces() and K_EMOJI removed. tests/t1/discord.sh passes with its goldens unchanged (its last frame is the settings screen); a mid-session frame (ZINC_SHOT_EVERY) shows "Morning! [emoji][emoji] @maintainers" inline.

Tests: ui_pictures (new; tests/golden/ui-pictures/main.out: interpreter layout and frame hash, the same hash on QuickJS, the compiled program and the React model), ternary_int_float (new), ui_runs, ui_run_strike, jsx, discord pass. agents_markdown fails identically on develop's ui.ts (wide frame 40590: 'default model · Read only' ends at 584).
<!-- SECTION:NOTES:END -->
