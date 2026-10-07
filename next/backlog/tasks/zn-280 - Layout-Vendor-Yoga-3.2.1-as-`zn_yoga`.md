---
id: ZN-280
title: 'Layout: Vendor Yoga 3.2.1 as `zn_yoga`'
status: Done
assignee: []
created_date: '2026-10-07 13:07'
updated_date: '2026-10-07 15:21'
labels:
  - ui
  - layout
  - size-S
milestone: m-17
dependencies: []
ordinal: 50700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-1). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `third_party/yoga` holds v3.2.1 sources, `LICENSE`, row in `third_party/README.md` with commit and sha256.
- [x] #2 Builds warning-free with clang and `zig c++` for macos, linux and `arm-linux-musleabihf -mcpu=arm1176jzf_s`.
- [x] #3 T0 test links it and computes a 2-node row layout (80+80 px in 100 px, shrink 0 and web defaults 1) with the expected boxes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. third_party/yoga/yoga (19 .cpp, v3.2.1 sha256 86b399ac…) + LICENSE, row in third_party/README.md; CMake zn_yoga (GLOB of the sources, C++20) and yoga_test; tests/t0/yoga.sh: 2 children of 80 px in a 100 px row give 50+50 with shrink 1 (web) and 80+80 with shrink 0 (RN). Compiled with -Wall -Wextra and no output by clang (macos) and zig c++ for aarch64-macos, x86_64-linux-gnu, aarch64-linux-gnu and arm-linux-musleabihf -mcpu=arm1176jzf_s. Also parked ZN-250 (ST-01) on the way: it rewrites the ui.ts hunks that carry another developer's uncommitted work.
<!-- SECTION:NOTES:END -->
