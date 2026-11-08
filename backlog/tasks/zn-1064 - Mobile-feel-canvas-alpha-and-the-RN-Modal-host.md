---
id: ZN-1064
title: 'Mobile feel: canvas alpha and the RN Modal host'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:42'
updated_date: '2026-11-08 22:51'
labels:
  - ui
  - size-S
milestone: m-5
dependencies: []
ordinal: 4600
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
- [x] #1 A canvas (onDraw, Icon) inside a fading or scaled view honours the alpha; navigation no longer needs Navigation.alphaOf
- [x] #2 RN Modal host with object style position absolute gets its size in the classic layout and dismisses only on outside press
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet, 2026-11-08): Flutter applies a parent Opacity to a CustomPainter through an OpacityLayer (saveLayer, one composite, costly); Android's View.setAlpha uses a layer unless hasOverlappingRendering() is false, then it multiplies the alpha into each draw op (cheap, overlapping primitives show through each other); Skia saveLayerAlpha vs paint alpha; web canvas globalAlpha is per draw call. react-native-web's Modal host is a fixed full-viewport overlay (inset 0); native RN Modal has no outside-press dismissal, apps add a backdrop Pressable. Links: https://flutter.googlesource.com/mirrors/engine/+/refs/heads/flutter-1.19-candidate.2/flow/layers/opacity_layer.h , https://cdn.jsdelivr.net/npm/@expensify/react-native-web@0.18.16/dist/exports/Modal/ModalContent.js.flow

Decision (canvas alpha): zinc:gfx keeps a global alpha (setGlobalAlpha/globalAlpha, 0..255) that every alpha-taking command multiplies in the module's TS wrappers (rect and line go through rrect/stroke when it is below 255; text is not affected); ui.ts paint sets it to the canvas node's inherited alpha around onDraw (try/finally, drawing reset there too). Per-primitive multiply as Android's no-overlap path, not an offscreen layer: no image per fading canvas, no runtime row, the three engines share the TS module. ponytail: overlapping primitives of one canvas show through each other while it fades; a UI painted from inside onDraw multiplies again. Scale was already honoured (the callback gets the scaled box; BackButton and Icon draw in it). navigation.tsx loses alphas/alphaOf and the routeKey prop.

AC2: on develop the Modal host already gets 240x320 in the classic layout (object style position absolute is applied since the style-object keys work, and layoutLayers sizes a layer with left/right/top/bottom set): checked with a repro and with the navigation golden copied to the classic layout (ios and android, a press inside the presented modal keeps it). RN Modal has no outside-press dismissal; a press inside does not ask onRequestClose, Escape does. Regression test tests/t0/ui_canvas_alpha.sh (alpha 128 under opacity-50 and 255 after; the Modal host size, press, Escape). Proven on interpreter, --native and --engine quickjs.

Proposed tests: tests/run --only navigation (T1, goldens should stay identical: the arrow's alpha is the same number; ~20 s, <300 MB). tests/t1/navigation.sh in the classic layout (zinc.json without layout rn) once re-blessed, ~20 s.
<!-- SECTION:NOTES:END -->
