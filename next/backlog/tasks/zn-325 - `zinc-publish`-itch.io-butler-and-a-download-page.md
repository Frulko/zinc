---
id: ZN-325
title: '`zinc publish`: itch.io (butler) and a download page'
status: Backlog
assignee: []
created_date: '2026-10-08 14:19'
labels:
  - distribution
  - size-S
milestone: m-19
dependencies:
  - ZN-320
ordinal: 55100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc publish --itch user/game:channel` with the pinned butler (fetched on first use), and `--site dir` writing a static download page (one button per platform, checksums). Publishing is outward-facing: the task runs everything with --dry-run and records the command; the owner runs the real upload.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 --dry-run prints the butler commands for every exported target
- [ ] #2 the download page lists each artifact with its sha256 and size
- [ ] #3 butler is pinned and verified by checksum
<!-- AC:END -->
