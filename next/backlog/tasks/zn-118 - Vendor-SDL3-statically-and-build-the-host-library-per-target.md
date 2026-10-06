---
id: ZN-118
title: Vendor SDL3 statically and build the host library per target
status: Backlog
assignee: []
created_date: '2026-10-06 22:58'
labels:
  - rendering
  - packaging
  - size-M
milestone: m-8
dependencies: []
ordinal: 40600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The package bundles Homebrew's dylib today. Vendor SDL 3.4.x (zlib licence), build it per target with a recorded source list and platform headers fetched at build time or prebuilt in CI (decision recorded in 04 risks), link it statically into the host library, drop the dylib from the macOS and Linux packages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tools/package output has no external dylib; otool -L / ldd show system libraries only
- [ ] #2 the clean-machine test (tests/t2/package.sh) passes; package size recorded against the budget
<!-- AC:END -->
