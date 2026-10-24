---
id: ZN-813
title: 'Fix two stale texts: zinc update message and AGENTS.md machine description'
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-S
milestone: m-19
dependencies: []
ordinal: 13100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-718: `zinc update` (src/main.cpp ~2429) still prints "the macOS app: drag it over the old one; Linux: unpack...": say to unpack the tar.gz or run install.sh again.
- ZN-718: AGENTS.md describes the development Mac as an Intel one; it is an Apple M1 Pro (arm64): correct "The development machine" and the Intel-specific numbers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc update` says to unpack the tar.gz or run install.sh again
<!-- AC:END -->
