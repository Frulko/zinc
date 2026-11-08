---
id: ZN-1063
title: 'zinc lint: more rules'
status: Backlog
assignee: []
created_date: '2026-11-07 16:42'
labels:
  - cli
  - size-S
milestone: m-20
dependencies: []
ordinal: 1055000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opt-in checks users would meet in zinc lint.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-718: zinc lint: a rule for zinc.json dependencies that nothing imports (the knip idea).
- ZN-718: zinc lint: JPEG and WebP pixel sizes in the asset estimate (only PNG reads its size from the header).
- ZN-718: zinc lint: target rules in the LSP (`--json` is the hook), and a `boot` budget estimate from assets.groups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A rule for zinc.json dependencies nothing imports
- [ ] #2 JPEG and WebP sizes in the asset estimate
- [ ] #3 boot budget estimate from assets.groups; target rules in the LSP
<!-- AC:END -->
