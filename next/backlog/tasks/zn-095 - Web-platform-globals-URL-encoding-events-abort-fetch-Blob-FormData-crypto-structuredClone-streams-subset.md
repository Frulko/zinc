---
id: ZN-095
title: >-
  Web platform globals: URL, encoding, events, abort, fetch, Blob, FormData,
  crypto, structuredClone, streams subset
status: Backlog
assignee: []
created_date: '2026-10-06 22:54'
labels:
  - host-modules
  - stdlib
  - size-L
milestone: m-14
dependencies:
  - ZN-062
  - ZN-070
  - ZN-066
  - ZN-064
  - ZN-090
  - ZN-091
  - ZN-087
  - ZN-092
ordinal: 40370
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make lib/std/web.ts and fetch.ts compile and run (35 diagnostics today, all caused by tasks listed as dependencies), add the auto-import so URL, URLSearchParams, TextEncoder/TextDecoder, Event/EventTarget/CustomEvent, AbortController/AbortSignal, Headers/Request/Response/fetch, Blob/File/FormData, MessageChannel, crypto, structuredClone, atob/btoa, performance, WebAssembly resolve as globals like in the prototype (docs/guide/09-web-apis.md, txiki-elsa-parity.md). Add the missing pieces named there only if the examples or WPT subsets need them (streams: ReadableStream minimal for fetch bodies).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/conformance/web.ts and fetch_web.ts pass; WPT URL data 896/896 and setters 278/278 as in the prototype
- [ ] #2 tests/compat/run.mjs harness numbers are reproduced by `zinc test` (see C-compat)
- [ ] #3 no web global is linked into a program that does not use it (AOT binary size check)
<!-- AC:END -->
