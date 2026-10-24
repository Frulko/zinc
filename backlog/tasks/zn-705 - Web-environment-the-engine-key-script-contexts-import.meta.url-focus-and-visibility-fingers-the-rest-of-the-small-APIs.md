---
id: ZN-705
title: 'Web environment: focus, visibility, fingers and the small APIs'
status: Backlog
assignee: []
created_date: '2026-10-10 22:50'
labels:
  - js
  - qjs
  - size-M
milestone: m-22
dependencies: []
ordinal: 16800
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Remove the engine key and import.meta.url from the description. Keep: window focus/blur/visibilitychange, touch as pointers, modifier-key events, Script({web:true}), FormData and storage properties. Already there: src/qjs/qjs.cpp:348 (import.meta.url); zinc.json "engine" key shipped (CHANGELOG 223).

(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) zinc.json `"engine": "quickjs"` and `new Script({web: true})` from zinc:script; `import.meta.url`; window focus, blur and visibilitychange, touch points as pointers and modifier keys (needs host rows); localStorage as properties, FormData, a binary request body, matchMedia, canvas toDataURL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a test per item, each on a page a library would write
- [ ] #2 the trace of the three booted libraries names nothing of this list any more
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. import.meta.url and the engine key are done. Left: focus/blur/visibilitychange, fingers as pointers, modifier keys, new Script({web:true}), small APIs (FormData, localStorage properties). Evidence: src/qjs/qjs.cpp:348 (import.meta.url); zinc.json "engine" key shipped (CHANGELOG 223)
<!-- SECTION:NOTES:END -->
