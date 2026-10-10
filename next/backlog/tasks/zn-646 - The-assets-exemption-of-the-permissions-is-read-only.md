---
id: ZN-646
title: The assets exemption of the permissions is read-only
status: Backlog
assignee: []
created_date: '2026-10-10 17:18'
labels:
  - security
  - permissions
  - size-S
milestone: m-19
dependencies: []
priority: high
ordinal: 120910
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-314: denyByPermission also exempts fs:write under the assets directory, so an enforcing program with a writable assets directory can symlink any file there and read it without fs:read. The exemption must cover reads of the app's own assets only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 enforced: fs.writeText and fs.symlink under assets need fs:write
- [ ] #2 reading an asset needs no permission
- [ ] #3 a case in tests/t0/permissions.sh
<!-- AC:END -->
