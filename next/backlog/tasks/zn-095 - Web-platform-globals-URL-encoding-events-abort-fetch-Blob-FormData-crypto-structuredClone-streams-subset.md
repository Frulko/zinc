---
id: ZN-095
title: >-
  Web platform globals: URL, encoding, events, abort, fetch, Blob, FormData,
  crypto, structuredClone, streams subset
status: Review
assignee: []
created_date: '2026-10-06 22:54'
updated_date: '2026-10-07 06:43'
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
- [x] #1 tests/conformance/web.ts and fetch_web.ts pass; WPT URL data 896/896 and setters 278/278 as in the prototype
- [ ] #2 tests/compat/run.mjs harness numbers are reproduced by `zinc test` (see C-compat)
- [x] #3 no web global is linked into a program that does not use it (AOT binary size check)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Web globals resolve without imports: the loader (modules.cpp webGlobalImports) appends `import { names } from 'zinc:web'` (or 'zinc:web/fetch' for fetch, Request, Response, Headers) to a source that uses a name it does not declare, and parses it again (positions stay); a program that names none links nothing of web.ts (checked on its bytecode). Needed compiler work: records of generic data interfaces (CustomEventInit<T>) are records, toJSON() decides JSON.stringify (URL had cycles), a value into `unknown | null` becomes a Dyn, a Dyn view skips public fields it cannot show (Request), `unknown | null` is not converted from a Dyn (infinite __dynFrom), console.error/warn/trace now go to the standard error stream (new builtin ConsoleError, opcodes LogBegErr/LogEndErr, VM and AOT; info/debug stay on stdout). Results: tests/conformance/web.ts and fetch_web.ts equal the old simulator's stdout (tests/t1/conformance.sh), WPT url/resources/urltestdata.json 896/896 and setters_tests.json 278/278 (tests/data/wpt pinned, tests/t1/wpt_url.sh). AC2 open: the compat harness (tests/compat/run.mjs) numbers need `zinc test` of the compat task (ZN-139). Not done: lib/web.d.ts for the tsc oracle, WebAssembly global, streams (ReadableStream), URL.toascii IDNA gaps as in the prototype.
<!-- SECTION:NOTES:END -->
