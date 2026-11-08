---
id: ZN-640
title: 'Network log: mask multipart/form-data fields'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 17:01'
updated_date: '2026-11-08 21:35'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 4200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-635 masks query parameters, urlencoded form fields and JSON fields named in ZINC_NET_SENSITIVE; a multipart form is recorded as sent. (Follow-up of ZN-635, D63.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a FormData field named in ZINC_NET_SENSITIVE is *** in the Network events and in the HAR, with a case in netlog.sh
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08. src/host/netlog.cpp maskBody: a multipart/form-data body is split on its boundary (from Content-Type, quoted or not); the content of each part whose Content-Disposition name (not filename) is in ZINC_NET_SENSITIVE becomes ***; boundaries, part headers, other fields and file parts are kept byte for byte, binary ones too (checked before the text test, so a form with a binary file is still masked); a part cut short is kept as is. The same function serves the Network events, getRequestPostData/getResponseBody and the HAR.
Test: tests/golden/host/netlog.tsx posts a FormData (user, pin, a text File) through zinc:web/fetch; tests/netlog_servers.py echoes multipart as it does urlencoded; tests/netlog_check.py checks the pin part is ***, user and the file kept, in the events, the response body and the HAR, and 'multipart-secret' absent everywhere. tests/run --only netlog passes (TLS run included).
Research: Chrome's sanitized HAR export (default since the 'Allow to generate HAR with sensitive data' setting) strips only Cookie/Authorization/Set-Cookie headers, never bodies (devtools-frontend acd96a60, front_end/models/har/Log.ts); HAR 1.2 leaves multipart to postData.text; no proxy or library found masking multipart by field name, so a small splitter per RFC 7578 (https://www.rfc-editor.org/rfc/rfc7578): keep boundary and CRLF framing, never scan file bytes.
Later: none.
<!-- SECTION:NOTES:END -->
