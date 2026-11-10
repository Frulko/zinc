---
id: ZN-1111
title: Preserve runtime typeof for optional numeric union values
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 02:24'
labels:
  - ui
  - compiler
  - size-M
milestone: m-32
dependencies: []
ordinal: 1219
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings23 cannot honor the public numeric Avatar size contract on interpreter/AOT. Natural interface Example { size?: string | number }; report({size:56}) returns typeof p.size=object on interp/AOT, number on QuickJS; reading numeric payload through a diagnostic cast returns56 everywhere. The natural typeof branch chooses40/40/56, and actual Avatar boxes are40/40/56. Preserve application/provider code; fix the engine representation/lowering once. Minimal source and all3 logs: .logs/blockers/typeof-union/avatar-repro and avatar-*.log. Existing protected external runtime/ui.ts/HAL WIP must not be committed. Primary reference https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-typeof-operator (Number returns number); direct short lookup done by coordinator because sonnet unavailable/runtimefull.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Natural optional string|number fields report runtime typeof and choose the correct branch across interpreter, AOT and QuickJS, with a small exact T0 regression covering numeric/string/undefined and evaluation count
- [ ] #2 Original unchanged Avatar size56 and Settings composition render the same requested size on all three engines; no caller cast or UI workaround
<!-- AC:END -->
