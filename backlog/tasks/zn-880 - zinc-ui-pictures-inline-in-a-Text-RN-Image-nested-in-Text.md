---
id: ZN-880
title: 'zinc:ui: pictures inline in a Text (RN <Image> nested in <Text>)'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 18:55'
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
- [ ] #1 An <Image> inside a <Text> (React and Solid) flows with the words: it wraps with them, sits on the baseline line box, and takes its width and height
- [ ] #2 setTextRuns or an equivalent API places a picture run in a text, for code that builds runs (the Discord Markdown)
- [ ] #3 Same frame on the interpreter, AOT and QuickJS; a golden with a picture at a line end that wraps
- [ ] #4 examples/discord draws custom emoji inside its message text instead of cutting the paragraph into a wrapping row
<!-- AC:END -->
