---
id: ZN-815
title: >-
  QuickJS and npm packages: Web globals, browser field, CommonJS, local Date,
  catch annotations
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:56'
updated_date: '2026-11-08 22:58'
labels:
  - size-M
milestone: m-14
dependencies: []
ordinal: 6800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-?: QuickJS bundle: packages that read Web globals (crypto, TextEncoder, fetch, URL) get undefined because zinc:web imports are added per project file only; install them as globals when linking packages (uuid fails)
- ZN-?: QuickJS bundle: try the `browser` field and `--conditions=browser` after module/main (nanoid picks its Node build; papaparse and qs stop on Node built-ins)
- ZN-?: `zinc run x.ts --engine quickjs` cannot load CommonJS/UMD packages (dayjs); auto-bundle packages or tell the user to run zinc bundle
- ZN-?: Date on QuickJS: src/qjs/prelude.cpp makes local getters UTC while the constructor and getTimezoneOffset keep the machine zone, so date-fns/dayjs/moment are off by the offset outside UTC
- ZN-?: the TS stripper rejects a type annotation on a catch variable (`catch (e: any)`)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Packages reading crypto/TextEncoder/fetch/URL get the globals when linked
- [x] #2 `browser` condition tried after module/main; CommonJS/UMD (dayjs) loads or the error says to run zinc bundle
- [x] #3 Date local getters agree with the constructor zone (date-fns/dayjs/moment test)
- [x] #4 `catch (e: any)` parses
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worktree agent).

Web search (sonnet): esbuild --platform=browser main fields browser,module,main and conditions browser+module, exports conditions matched in the package's key order (esbuild issue 3867, resolve.exports); browser map with false = empty module; nanoid's browser condition picks index.browser.js (Web Crypto) over node:crypto (nanoid #207); QuickJS-ng getTimezoneOffset uses localtime_r, TZ+tzset makes it UTC; fake-timer epochs: sinon 0, Jest real now (https://esbuild.github.io/api/, https://github.com/evanw/esbuild/issues/3867, https://github.com/ai/nanoid/issues/207, https://github.com/sinonjs/fake-timers, https://jestjs.io/docs/jest-object).

What changed:
- Web globals: zinc:web/globals (src/qjs/qjs.cpp kWebGlobalsJs) installs the WinterTC common set (crypto, fetch, Request, Response, Headers, URL, URLSearchParams, TextEncoder/Decoder, atob, btoa, Event, EventTarget, CustomEvent, AbortController/Signal, DOMException, structuredClone, Blob, File, FormData, MessageChannel/Port) where undefined. Every package module imports it at its end (lines hold); zinc bundle walks it and its link entry imports it before the program. Never document/window/navigator (they tell a library it runs in a page). Not on the web profile nor mquickjs.
- Resolution as a browser build (resolve.cpp, shared by every engine; bundle.cpp): exports conditions browser/import/module/default in the package's key order, then the browser field (string), module, main; the browser object map remaps files and bare names, false = empty module (also for require in the CommonJS wrapper). zinc bundle links with --platform=browser --define:global=globalThis (was neutral, module,main).
- CommonJS/UMD: dayjs already loaded as a default import; named imports now work (commonJsNames, a small cjs-module-lexer: exports.x =, module.exports = {a, b: c}, defineProperty(exports, 'x')). A missed name on a CommonJS package prints a hint to import the default or run zinc bundle; an unresolved require says zinc bundle links it.
- Date: the prelude no longer makes the local getters UTC; a deterministic run without TZ sets TZ=UTC before QuickJS/JSC/V8/Hermes start (deterministicZone, the typed engine's tzOffsetMinutes rule). Proven: same hours/offset/ISO on zinc, quickjs and jsc under TZ=Europe/Paris and ZINC_DETERMINISTIC.
- catch (e: any): the stripper erases the annotation (the parser keeps no node for it).

Decision to record (coordinator): JS engines resolve npm packages as a browser (browser condition and field first, as esbuild/Vite/webpack for a browser target), with the WinterTC Web globals installed for packages; the AC's 'browser after module/main' read as 'added to module/main', since nanoid (exports browser condition) and qs/object-inspect (browser map false) need the browser build to win. Why: QuickJS has no Node built-ins, the Node builds fail on them. Revisit: a package whose browser build needs window/document.

Proof: tests/t0/qjs_npm.sh (fixtures: UMD dayjs shape, nanoid shape, uuid shape, qs/object-inspect browser map, catch annotation, local Date under three TZ, unbundled and bundled) PASS; qjs_bundle PASS. Real packages from local node_modules (dayjs 1.11.20, date-fns 4.1.0, nanoid 5.1.7, uuid 8.3.2, qs) print the same as Node unbundled and bundled, TZ America/New_York and Asia/Kolkata.

later.md lines:
- ZN-815: CommonJS reexports (module.exports = require('./x')) are not followed for named imports on unbundled QuickJS; Node's cjs-module-lexer follows them.
- ZN-815: a browser build that reads window or self fails outside a web project; alias self to globalThis for packages if one shows up.

Proposed tests: tests/run --only qjs (T0, QuickJS loader regression after resolver change, ~10 s, <200 MB); tests/run --only modules tsconfig platform_files (shared resolver, ~10 s); tools/diff-matrix at the milestone (three engines agree on Date goldens).
<!-- SECTION:NOTES:END -->
