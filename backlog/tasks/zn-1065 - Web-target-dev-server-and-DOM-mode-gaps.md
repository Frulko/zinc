---
id: ZN-1065
title: 'Web target: dev server and DOM-mode gaps'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:43'
labels:
  - web
  - size-S
milestone: m-14
dependencies: []
ordinal: 9100
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small defects of the web export.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-?: `three` from npm in a web project resolves to the zinc:three plugin; the web backend of zinc:three (plugins agent) decides, or npm three wins on the web target
- ZN-?: the dev pre-bundle does not watch workspace packages; reload on a workspace package edit
- ZN-?: web `zinc dev --target web` for vendored UMD/addon libraries (three addons, MapLibre) once the unbundled dev server can load them
- ZN-?: silence W0603 for `zinc:map` on the web (lazy network calls in index.ts or a browser shim for zinc:net)
- ZN-?: a DOM-mode program that draws with gfx alone and has no zinc:ui tree yields no elements; export it in canvas mode or make DOM mode mount a canvas
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc dev reloads on an edit of a workspace package
- [ ] #2 A DOM-mode program that draws with gfx alone mounts a canvas; vendored UMD/addon libraries load in zinc dev --target web
- [ ] #3 zinc:map raises no W0603 on the web; npm three on the web target resolves by a documented rule
<!-- AC:END -->
