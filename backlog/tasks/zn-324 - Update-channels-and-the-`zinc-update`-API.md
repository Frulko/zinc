---
id: ZN-324
title: 'Update channels and the `zinc:update` API'
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-09 01:34'
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
- [x] #1 a local HTTP server test: check, download, verify, swap, restart
- [x] #2 a manifest with a bad signature or a lower version is refused
- [x] #3 a version that crashes at start rolls back to the previous one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-324.01 (zinc publish signed channels, update-app with signature and version checks), .02 (staged updates on trial, rollback after a crash at start), .03 (zinc:system/update: check, download, restart, healthy). usage: n/a
<!-- SECTION:NOTES:END -->
