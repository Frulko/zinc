---
id: ZN-122
title: Goldens by profile and size
status: Done
assignee: []
created_date: '2026-10-06 22:59'
updated_date: '2026-10-07 13:41'
labels:
  - profiles
  - tests
  - size-S
milestone: m-11
dependencies:
  - ZN-120
ordinal: 40640
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A manifest of golden per (program, profile, size): import the 44 fx12, 46 f32 and the size variants (1280x720, 1620x2160) of the prototype; `// zinc-test: requires` support; the listing shows SKIP reasons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc test --profile X` picks the right golden for every program that has one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. zinc test [--profile P] [dir]: src/test_cmd.cpp runs the conformance programs under the profile at its screen size, picks <name>.out / .f32.out / .fx12.out / .<W>x<H>.out, honours // zinc-test: requires | skip | gradual | deterministic | max-frames with the reasons in the listing (src/frontend/capabilities.cpp ports compiler/src/capabilities.ts: targets/capabilities.json + the profile table), same output format as the old runner (stdout, then [exit N] + stderr without zinc: notes). tests/t1/zinc_test.sh checks the selection per profile. Drag scrolling stays on for headless, deterministic and synthetic runs (lib/std/ui.ts hunk, ZN-228). The remaining differences are real gaps, task ZN-312.
<!-- SECTION:NOTES:END -->
