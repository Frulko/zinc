---
id: ZN-1113
title: Support ReturnType for inferred application model types
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 02:29'
labels:
  - compiler
  - ui
  - size-S
milestone: m-32
dependencies: []
ordinal: 1240.1
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Natural Mail model exports type Mailbox = ReturnType<typeof createMailbox>; zinc check rejects ReturnType with Z0101 while TypeScript utility return type is the ordinary way to share inferred model shape with component props. Four-line minimal .logs/blockers/return-type/return-type.ts expects42, current check failure in return-type.log. Keep original Mail code. Add the compiler utility using existing callable type machinery; inspect overload/generic/constraints and existing Partial/Required/Readonly/Pick/Omit handling. Primary short lookup https://www.typescriptlang.org/docs/handbook/utility-types.html#returntypetype; documented final overload behavior and generic return semantics. Do not invent a second conditional-type framework if existing types suffice. Protected runtime/HAL/ui.ts WIP remains untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ReturnType resolves callable return types with appropriate constraints/diagnostics and preserves ordinary function model shape; small exact T0 covers named/typeof, generics and overload behavior as applicable to Zinc supported syntax
- [ ] #2 Original Mail state and component prop types check and its short feature runs pass on interpreter, AOT and QuickJS without caller rewrite
<!-- AC:END -->
