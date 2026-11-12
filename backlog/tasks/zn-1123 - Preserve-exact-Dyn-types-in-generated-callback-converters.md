---
id: ZN-1123
title: Preserve exact Dyn types in generated callback converters
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 04:44'
labels:
  - language
  - frontend
  - size-S
milestone: m-7
dependencies: []
ordinal: 50001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks unchanged rn-showcase native compilation, discovered by ZN-863.03. lib/std/fetch.ts Request.clone boxes self into unknown and the generated from-Dyn callback loses a concrete Dyn parameter as any. A four-line class-to-unknown reproduction fails Z0103 on clean develop engine b63c8367a. Fix the frontend generator once; no application/library annotation workaround, assignability relaxation or runtime change. Read .logs/research-request-check-g/report.md and retained failing fixtures/logs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generated callback converters retain exact unknown/Dyn, actual any and Dyn-subclass parameter/result identities; a focused regression typechecks and runs on interpreter, AOT and QuickJS without weakening invalid-call rejection.
- [ ] #2 The original unchanged Request clone/fetch source and examples/rn-showcase typecheck successfully; source hashes demonstrate no caller workaround.
<!-- AC:END -->
