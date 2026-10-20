---
id: ZN-001
title: Freeze the corpus outputs
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 15:18'
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
- [x] #1 the 18 `tests/conformance` programs, the bench kernels and one UI frame have checked-in expected files with a script that regenerates them; each file has a recorded hash; the check runs without Node.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Froze 62 conformance .out (default profile, all programs, the '18' subset is not defined anywhere so all are frozen), 11 bench kernel outputs (sim oracle) and 1 UI frame (clock-20.png) into next/corpus with MANIFEST.sha256. freeze.sh regenerates (needs Node, reproducible), tests/t0/corpus.sh checks hashes without Node. usage: 65528 in / 3302508 cached / 24404 out tokens, 46 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
