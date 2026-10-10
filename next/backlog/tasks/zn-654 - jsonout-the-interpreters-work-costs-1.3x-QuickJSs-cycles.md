---
id: ZN-654
title: 'jsonout: the interpreter''s work costs 1.3x QuickJS''s cycles'
status: Backlog
assignee: []
created_date: '2026-10-10 17:57'
labels:
  - perf
  - interp
  - size-M
milestone: m-21
dependencies: []
ordinal: 400410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tools/bench-m4 now judges jsonout on its work (ZN-648: each engine's cycles for the kernel minus its cycles for an empty program, /usr/bin/time -l, in alternation): interpreter ~5.5M cycles, compiled ~3.9-4.6M, QuickJS ~4.3M on the Intel Mac (machine at load 8; two runs agreed). The kernel builds 500 small objects ('item-' + i.toString(), i * 0.5) and JSON.stringify's them once. Profile the interpreter on it (zinc profile, or a loop of 100 stringify calls to get a measurable run), find what costs (number formatting, string building, the stringify walk through the class fields) and bring the work under QuickJS's.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tools/bench-m4: jsonout's interpreter work not slower than QuickJS's (short kernel threshold), on a quiet Intel Mac
<!-- AC:END -->
