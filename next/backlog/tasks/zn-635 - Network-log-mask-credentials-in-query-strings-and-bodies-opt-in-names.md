---
id: ZN-635
title: 'Network log: mask credentials in query strings and bodies (opt-in names)'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:27'
updated_date: '2026-10-10 16:33'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50220
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Headers and URL userinfo are masked at record time; query strings and bodies are not. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the names in ZINC_NET_SENSITIVE also mask query parameters and form or JSON body fields, in the events and the HAR
<!-- AC:END -->
