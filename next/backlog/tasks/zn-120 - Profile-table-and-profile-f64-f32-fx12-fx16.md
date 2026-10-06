---
id: ZN-120
title: 'Profile table and --profile (f64, f32, fx12, fx16)'
status: Backlog
assignee: []
created_date: '2026-10-06 22:58'
labels:
  - profiles
  - size-M
milestone: m-11
dependencies: []
ordinal: 40620
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
include/zn/profile.h and targets/profiles.json merged with capabilities.json: `zinc run/test --profile ps1|esp32|...` sets the number alias (f64/f32/fx12/fx16), the heap budget (enforced by the allocator), screen defaults and strict typing; the profile is part of the ZBC header.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `--profile esp32` on the host interpreter makes `number` an f32 and prints the .f32.out goldens of tests/conformance; a heap overflow gives the same error as the target
- [ ] #2 zinc.json `profile` is honoured
<!-- AC:END -->
