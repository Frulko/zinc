---
id: ZN-641
title: 'Prototype: zinc:net programs compile again'
status: Backlog
assignee: []
created_date: '2026-10-10 17:03'
labels:
  - prototype
  - size-S
milestone: m-20
dependencies: []
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-637: the prototype's sim conformance (`node compiler/bin/zinc.mjs test --target sim`, 62 programs) fails on fetch.ts, modules.ts and fetch_web.ts. lib/modules.d.ts:142 declares the anonymous type `{ cert: string; key: string; }` (Z9004 in tests/conformance/fetch.ts and modules.ts) and tests/conformance/fetch_web.ts:4 gives Z9033. The prototype is the specification and the source of the goldens, so its own corpus must pass. (Follow-up of ZN-637, D64.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 node compiler/bin/zinc.mjs test --target sim prints 62 programs and no failure
<!-- AC:END -->
