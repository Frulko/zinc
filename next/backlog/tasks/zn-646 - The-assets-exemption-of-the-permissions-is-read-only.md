---
id: ZN-646
title: The assets exemption of the permissions is read-only
status: Done
assignee: []
created_date: '2026-10-10 17:18'
updated_date: '2026-10-10 21:23'
labels:
  - security
  - permissions
  - size-S
milestone: m-19
dependencies: []
priority: high
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-314: denyByPermission also exempts fs:write under the assets directory, so an enforcing program with a writable assets directory can symlink any file there and read it without fs:read. The exemption must cover reads of the app's own assets only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 enforced: fs.writeText and fs.symlink under assets need fs:write
- [x] #2 reading an asset needs no permission
- [x] #3 a case in tests/t0/permissions.sh
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: denyByPermission (src/host/sys_host.cpp) exempts the app's assets for fs:read only; writes, removals, renames, chmod and symlinks there need fs:write when enforced. tests/golden/permissions-assets (fs:read:data only): reading an asset works, writing a file and placing a link in assets/ are refused naming fs:write and leave nothing behind (run on a copy); added to tests/t0/permissions.sh. aot_assets and run_cache pass. usage: n/a
<!-- SECTION:NOTES:END -->
