---
id: ZN-704
title: Styles panel edits work in the real Chrome DevTools frontend
status: Backlog
assignee: []
created_date: '2026-10-10 22:24'
labels:
  - devtools
  - ui
  - size-S
milestone: m-20
dependencies: []
ordinal: 475410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-369: element.style and the box model were checked with a scripted CDP client (scripts/cdp-check.mjs --styles), not with the DevTools frontend itself, which may ask for more (CSS.enable events, styleSheetAdded for the inline sheet ids, rule origins without a styleSheetId, computed-style tracking). Load devtools://devtools/bundled/inspector.html?ws=127.0.0.1:<port>/zinc in headless Chrome (tools/cdp.py drives it) against tests/data/devtools_styles, select a box, edit padding-left in the box model and a colour in element.style through the frontend's own UI, and check the app's frame and the console patch; fix what the frontend needs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an edit made through the DevTools frontend's box model changes the app's frame (scripted headless Chrome)
- [ ] #2 the Styles pane shows the class and StyleSheet rules without a frontend error
<!-- AC:END -->
