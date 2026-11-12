---
id: ZN-1128
title: Support lastIndexOf on dynamic arrays and strings
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 12:17'
labels:
  - language
  - frontend
  - size-S
milestone: m-7
dependencies: []
ordinal: 17501
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the original ZN-1039 counter-rename implementation: Doc.renameName validates a unique name with items.indexOf(old) and items.lastIndexOf(old), where items is the existing any-valued document list. The checker accepts the call, but interpreter execution throws TypeError: lastIndexOf is not a function. Minimal unchanged failure: const values: any = ['hits', 'other', 'hits']; console.log(values.lastIndexOf('hits')); expected 2. Authentic source/logs/snapshots: .worktrees/1039-counter-scores/.logs/proof/last-index.ts, stage-gap1/interp.log and stage-doc1/interp.log. Do not replace the application operation with a loop or cast workaround. Existing typed-array lastIndexOf and Dyn indexOf/string helpers provide the semantic implementation boundary; audit frontend dynamic method dispatch and prelude before touching shared runtime. Owner RT/HAL/UI/main work is held and must remain untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The unchanged dynamic-array lastIndexOf failure prints 2 on interpreter, actual native AOT and QuickJS, with the original production counter-rename caller working unchanged.
- [ ] #2 A focused regression covers dynamic arrays and strings, omitted and supported explicit starting positions, misses, duplicate values and strict identity; existing typed search behavior and current dynamic method callers remain coherent.
- [ ] #3 The change stays in the shared frontend/Dyn implementation with a small T0 regression, affected mapping and module notes; no application workaround or owner-held RT/HAL/UI/main edit.
<!-- AC:END -->
