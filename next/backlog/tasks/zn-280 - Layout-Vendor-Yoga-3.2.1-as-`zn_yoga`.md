---
id: ZN-280
title: 'Layout: Vendor Yoga 3.2.1 as `zn_yoga`'
status: Backlog
assignee: []
created_date: '2026-10-07 13:07'
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
- [ ] #1 `third_party/yoga` holds v3.2.1 sources, `LICENSE`, row in `third_party/README.md` with commit and sha256.
- [ ] #2 Builds warning-free with clang and `zig c++` for macos, linux and `arm-linux-musleabihf -mcpu=arm1176jzf_s`.
- [ ] #3 T0 test links it and computes a 2-node row layout (80+80 px in 100 px, shrink 0 and web defaults 1) with the expected boxes.
<!-- AC:END -->
