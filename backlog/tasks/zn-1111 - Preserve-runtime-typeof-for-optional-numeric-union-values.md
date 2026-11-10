---
id: ZN-1111
title: Preserve runtime typeof for optional numeric union values
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-10 02:24'
updated_date: '2026-11-10 02:31'
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
- [x] #1 Natural optional string|number fields report runtime typeof and choose the correct branch across interpreter, AOT and QuickJS, with a small exact T0 regression covering numeric/string/undefined and evaluation count
- [x] #2 Original unchanged Avatar size56 and Settings composition render the same requested size on all three engines; no caller cast or UI workaround
<!-- AC:END -->

## Implementation Notes

- Research: ECMAScript typeof evaluates its operand once and reports the runtime Number/String/Undefined kind: https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-typeof-operator. Coordinator supplied the primary lookup (Sonnet unavailable); worker checked it directly. Existing Dyn conversion/helpers already implement those semantics; no dependency or new opcode needed.
- Root cause: checker typeof recognized only `any`/`unknown`, although heterogeneous unions already use Dyn storage. Nonoptional unions were folded to object; optional unions used a nullable helper whose remaining union was also folded to object. Route Dyn-backed unions through existing __dynTypeof and the existing union-to-Dyn conversion, preserving null versus undefined and one evaluation. Only frontend/check.cpp changes; interpreter/AOT share it, QuickJS retains JavaScript typeof.
- Exact T0 typeof_union PASS on interpreter/AOT/QuickJS; covers numeric/string/missing/explicit undefined fields, zero/fractional numbers, a natural numeric branch, nonoptional/nullable mixed unions, optional number and ordinary i32/f64 controls, one call, receiver and getter evaluation. `zinc check tests/data/typeof_union/main.ts` PASS. Mapping and changelog included.
- Original Avatar minimal source SHA256 90aab10ccc6f108f85f3a76cc9cde278e0a4fa935bfec92b99b8d04572dd4b10 unchanged: typeof number, branch56, box [16,16,56,56] on all three engines. Original Settings src bytes verified against e5ffa9f27 (Settings feature04826c88f); an external probe imports unchanged App, finds original Alex Morgan role=img, asserts box width/height56. All3 produce [351,264,56,56]. No component/provider/caller edits or casts added.
- Candidate binary .worktrees/1111/build/zinc SHA256 c7643c501a00386aee98f85e16415bd74345d503d1312f36dd2172932c8f3f86; adjacent AOT archives preserved. Durable logs .logs/blockers/typeof-union/{build-1111,t0-1111,candidate-check,candidate-avatar-{interp,native,quickjs},candidate-settings-{interp,native,quickjs}}.log and candidate-1111-provenance.json. Scratch .worktrees/1111/.logs/{avatar-repro,original-settings,settings-size}; copy archived with proof before tree removal.
- Build succeeds with no warnings in changed frontend; full fresh-tree build exposes pre-existing warnings in V8/third-party headers, src/assets/cook.cpp and src/agent/dev.cpp. No suite, hardware or performance claims. No process left. Settings narrow Tabs reveal is separate ZN-1112 and stays open in ZN-1078.23.

## Proposed tests

- `ZINC_ROOT=$PWD ZINC=$PWD/build/zinc tests/run --only typeof_union`: exact all3 language regression, about 2–5 seconds warm / under100MB.
- Bounded all3 Settings original-App profile probe and Avatar repro, 3 headless frames: same56px contract, about2seconds interp/QJS plus7seconds cold native / under200MB. Broader Settings interactions and360px reveal remain with ZN-1078.23/ZN-1112.
