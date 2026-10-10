---
id: ZN-640
title: 'Network log: mask multipart/form-data fields'
status: Backlog
assignee: []
created_date: '2026-10-10 17:01'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50310
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-635 masks query parameters, urlencoded form fields and JSON fields named in ZINC_NET_SENSITIVE; a multipart form is recorded as sent. (Follow-up of ZN-635, D63.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a FormData field named in ZINC_NET_SENSITIVE is *** in the Network events and in the HAR, with a case in netlog.sh
<!-- AC:END -->
