---
id: ZN-324
title: 'Update channels and the `zinc:update` API'
status: In Progress
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-09 01:09'
labels:
  - distribution
  - size-M
milestone: m-19
dependencies:
  - ZN-318
ordinal: 55090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`update` in zinc.json (manifest URL, channel stable/beta); `zinc publish --channel` writes the signed manifest; the app checks, downloads, verifies and swaps the .zapp or the executable through `zinc:update`, with rollback when the new version fails to start.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a local HTTP server test: check, download, verify, swap, restart
- [ ] #2 a manifest with a bad signature or a lower version is refused
- [ ] #3 a version that crashes at start rolls back to the previous one
<!-- AC:END -->
