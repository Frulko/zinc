---
id: ZN-1119
title: Serialize quoted object fields with JSON.stringify
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-10 05:46'
updated_date: '2026-11-10 05:55'
labels:
  - compiler
  - size-S
milestone: m-28
dependencies: []
ordinal: 15499
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-896 Galene server is blocked by ordinary TypeScript: const group = { codecs: ['vp8', 'opus'], 'max-clients': 25, autokick: false }; console.log(JSON.stringify(group));. Current combined source58ee758c8 engine9a23bc25 rejects JSON.stringify with Z0005. Repro .logs/blockers/quoted-json/main.ts and baseline.log. Fill the checker/generated serializer gap once, preserving exact key spelling/escaping and valid zero/false/array values on interpreter/AOT/QuickJS; no manual JSON app workaround. Read quoted property callers and JSON serialization/JSONC fixtures. Primary semantics: https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-object-initializer and JSON.stringify serialization. Do not touch externally held runtime/rt/main/UI/HAL modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Original quoted max-clients group serializes correctly and runs unchanged on interpreter, AOT and QuickJS
- [x] #2 Exact short regression covers quoted/escaped keys, nested fields and existing JSON values without rejecting valid identifiers or weakening unsupported-type diagnostics
- [x] #3 Original ZN-896 configuration expression checks and runs with final binary; no app workaround
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-10 — Finished in work/1119; rebased onto develop 82bd4fb70 before committing. Scope: parser quoted field identity, constant string member access, inspect JSON validation/generation and its Dyn caller, shared string decoding, regression/mapping/changelog. No protected runtime/rt/main/UI/HAL/process changes.

Research: ECMAScript LiteralPropertyName StringLiteral uses the cooked string value (https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-object-initializer); SerializeJSONObject quotes each key through QuoteJSONString and serializes false and zero normally (https://tc39.es/ecma262/multipage/structured-data.html#sec-json.stringify). Reused the existing lowerer's literal decoder, moved unchanged to include/zn/string_literal.h, and the already vendored yyjson writer for generated source/JSON escaping. No dependency or handwritten JSON encoder. Constant string indexes on typed objects become ordinary Member nodes, preserving normal access/missing-property/readonly checks; dynamic indexes retain the existing rejection. JSON unsupported-type checks remain, except identifier-shaped key restriction was removed. Optional/additional fields use the same escaped key/access path; generated JSON callbacks are declared even when console inspection is unavailable for that type.

Proof: tools/build zinc completed; changed modules produced no warnings. Fresh dependency/CLI compilation reported existing src/agent/dev.cpp missing args initializer and third_party/nanosvg sign-compare warnings; these unrelated files were left alone. tools/work-run 60 env ZINC=<tree>/build/zinc tests/run --tier t0 --only json_quoted: PASS (one test). Regression runs interpreter/AOT/QuickJS and covers a-b versus a_b, empty/apostrophe/quote/backslash/newline/tab/control/Unicode keys, constant read/write, zero/false/null, nested records/arrays, function omission, optional fields, inheritance, unknown serialization, ordinary identifiers and negative function/union/missing-property/dynamic-index cases. Initial fixture rejected untyped regular:null; its explicit string|null annotation fixes the regression fixture, not the unchanged caller.

Original caller: /Users/mowmow/Lab/zinc/.logs/blockers/quoted-json/main.ts (SHA256 45da52eeac59877954785596b5a5f431a67f84319052583f59f2268923d749b4) checks and runs unchanged on interpreter/AOT/QuickJS; all produce exactly {"codecs":["vp8","opus"],"max-clients":25,"autokick":false}. Logs/script: .worktrees/1119/.logs/1119-final/. Binary /Users/mowmow/Lab/zinc/.worktrees/1119/build/zinc SHA256 38e22ed7035d08782e9293b57987ab76d4f95b3227bcd8e47b1b4131e018c6ab; built from 72908db66 plus this source diff, final rebase adds only root RESUME checkpoint 82bd4fb70. Binary and adjacent AOT libraries held stable for ZN-896 read-only use. Bounded headless proofs only; no owned processes remain. No whole server claim from this core task.

Decision proposal: none; direct semantic repair using existing components. Later lines/performance numbers: none. usage: n/a (tools/usage has no transcript for Codex).

Proposed tests: tests/run --tier t0 --only json_typed_shape — unchanged typed JSON.parse/conversion behavior after parser/Dyn changes, roughly 3 seconds/<1GB expected. tests/run --tier t0 --only lang — broader language goldens including ordinary JSON and string escapes after shared decoder move, owner-selected milestone only; duration/memory not measured. No suite, T1/T2, cross-platform or performance measurement run.
<!-- SECTION:NOTES:END -->
