---
id: ZN-002
title: Project skeleton
status: Ready
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 14:22'
labels:
  - size-S
milestone: m-0
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want `next/` to build with clang and with `zig c++`, with ASan/UBSan switchable, so that one toolchain serves compiler, VM and runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `cmake --build` succeeds on macOS arm64 with both compilers; `zinc --version` prints; sanitizer build runs.
<!-- AC:END -->
