---
id: ZN-1119
title: Serialize quoted object fields with JSON.stringify
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 05:46'
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
- [ ] #1 Original quoted max-clients group serializes correctly and runs unchanged on interpreter, AOT and QuickJS
- [ ] #2 Exact short regression covers quoted/escaped keys, nested fields and existing JSON values without rejecting valid identifiers or weakening unsupported-type diagnostics
- [ ] #3 Original ZN-896 configuration expression checks and runs with final binary; no app workaround
<!-- AC:END -->
