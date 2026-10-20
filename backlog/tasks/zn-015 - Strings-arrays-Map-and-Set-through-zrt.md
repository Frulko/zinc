---
id: ZN-015
title: 'Strings, arrays, Map and Set through `zrt`'
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 09:02'
labels:
  - size-M
milestone: m-2
dependencies: []
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want runtime builtins to be the existing native ones, so that behaviour matches today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `strings`, `mapset`, `sort` kernels produce the golden output.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a (tools/usage unavailable this run). Strings, arrays, Map, Set as builtin ZBC classes (format v3); one runtime table include/zn/runtime.h shared by checker, lowering, verifier, VM; nested exec for sort comparators; ?? (Map.get only under ??); integer kinds convert implicitly. strings/mapset/sort/nbody/spectralnorm match goldens. ASan T1, zig T0, 2500 fuzzed .zbc: 0 crashes; adversarial round 0 oracle violations. Limits: no RC, ASCII-only case mapping, charCodeAt OOB returns 0, Map.get needs ??.
<!-- SECTION:NOTES:END -->
