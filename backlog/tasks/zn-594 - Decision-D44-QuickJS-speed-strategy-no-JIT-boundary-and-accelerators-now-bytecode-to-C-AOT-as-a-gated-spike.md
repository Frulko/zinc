---
id: ZN-594
title: >-
  Decision D44: QuickJS speed strategy (no JIT, boundary and accelerators now,
  bytecode-to-C AOT as a gated spike)
status: Done
assignee: []
created_date: '2026-10-09 09:28'
updated_date: '2026-10-09 09:29'
labels:
  - perf
  - quickjs
  - decision
  - size-S
milestone: m-21
dependencies: []
priority: high
ordinal: 5600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record the decision proposed in docs/reports/quickjs-aot-jit-and-ffi.md section 9 as row D44 of docs/reports/zinc-next-decisions.md after owner review: (a) boundary fixes, typed fast native calls and native accelerators now; (b) QuickJS bytecode-to-C AOT only through the spike QJS-05 and its gate; (c) no QuickJS JIT (copy-and-patch or tracing) and no optimizing tier; (d) interpreter work in a small patch queue on top of quickjs-ng, proposed upstream; (e) a JIT engine on desktop stays the ZN-586 question. Scores per option are in the report (gain x3, targets x2, effort x2, risk x2, upstreamability x1). (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 D44 row added to docs/reports/zinc-next-decisions.md with the option scores and a revisit condition
- [x] #2 D13 and D36 cross-reference D44 (JS libraries are a different question from ZBC)
- [x] #3 ZN-586's description links D44
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
D44 recorded from the report's section 9 (scores and revisit condition), D13 and D36 point to it, ZN-586's description links it.
<!-- SECTION:NOTES:END -->
