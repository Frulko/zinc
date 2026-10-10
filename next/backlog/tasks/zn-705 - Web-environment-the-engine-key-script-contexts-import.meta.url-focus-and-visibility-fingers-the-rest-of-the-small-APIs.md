---
id: ZN-705
title: >-
  Web environment: the engine key, script contexts, import.meta.url, focus and
  visibility, fingers, the rest of the small APIs
status: Backlog
assignee: []
created_date: '2026-10-10 22:50'
labels:
  - js
  - qjs
  - size-M
milestone: m-22
dependencies: []
ordinal: 476410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) zinc.json `"engine": "quickjs"` and `new Script({web: true})` from zinc:script; `import.meta.url`; window focus, blur and visibilitychange, touch points as pointers and modifier keys (needs host rows); localStorage as properties, FormData, a binary request body, matchMedia, canvas toDataURL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a test per item, each on a page a library would write
- [ ] #2 the trace of the three booted libraries names nothing of this list any more
<!-- AC:END -->
