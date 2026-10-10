---
id: ZN-637
title: 'Prototype: build plugins/devtools with the new Spec member net'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:28'
updated_date: '2026-10-10 16:33'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50240
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-370 added `net` to the devtools native Spec with a one-line stub in cdp.host.cpp; the prototype build of the plugin was not compiled. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the prototype builds and runs an app with zinc:devtools on macOS
<!-- AC:END -->
