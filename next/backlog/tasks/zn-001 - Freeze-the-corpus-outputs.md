---
id: ZN-001
title: Freeze the corpus outputs
status: Ready
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 14:22'
labels:
  - size-S
milestone: m-0
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want the expected outputs and pixel goldens of the current corpus stored in the repo and independent of Node, so that the new engine has an objective target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the 18 `tests/conformance` programs, the bench kernels and one UI frame have checked-in expected files with a script that regenerates them; each file has a recorded hash; the check runs without Node.
<!-- AC:END -->
