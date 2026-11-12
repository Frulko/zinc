---
id: ZN-1126
title: Resolve imported record types in QuickJS checked JSON copies
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 10:10'
labels:
  - language
  - frontend
  - quickjs
  - size-M
milestone: m-7
dependencies: []
ordinal: 17503
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1037 AC3 and ZN-1125 production proof: WirePlaylist.rules?:ipod.SmartRules makes QuickJS schema acquisition empty, so the whole PlaylistsReply silently escapes checked conversion and a missing required playlist id is accepted. Actual interpreter and native AOT production wire pass; QuickJS genuine failure is retained in .worktrees/1037-remote-wire/.logs/HANDOFF-1037-BLOCKED.md and stage-1125-production/wire-quickjs.log. Read .logs/research-namespace-l.txt. Reuse existing ModuleResolver and import/export type bindings with module identity, not caller duplicated WireRules or global tail-name maps. Scope QJS strip/engine/private checked-schema acquisition, exact T0, fixtures/docs/mapping only; no RT/IR/ABI/host/HAL/UI/main edits. Native schemaOfType false and worker/native wire behavior remain unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Supported imported record types, including plugin namespace and type-only imported/local-reexported bindings, participate in QuickJS checked JSON copies; missing required fields and malformed nested records throw TypeError as on interpreter and native AOT.
- [ ] #2 Focused relative namespace, named alias, local re-export, export-from/star, same local names in separate modules and recursive/import-cycle controls preserve module identity and terminate; native wire schemas stay byte-identical.
- [ ] #3 The original production ZN-1037 wire, sender and atomic library-consumer fixtures pass on all three engines without caller type duplication, assertions, any casts or a daemon/network/device action.
<!-- AC:END -->
