---
id: ZN-647
title: 'Guide: where a built program finds its assets'
status: Backlog
assignee: []
created_date: '2026-10-10 17:18'
labels:
  - docs
  - size-S
milestone: m-19
dependencies: []
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/guide/01, 03 and 07 still say assets are compiled into the executable (the prototype's behaviour). On Zinc Next a built program reads ZINC_ASSETS, then assets/ beside the executable, then one level above it, then the start directory (ZN-314, D66); zinc export copies the directory beside the executable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the three guide pages describe the lookup order of D66 and what zinc export ships
<!-- AC:END -->
