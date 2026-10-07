---
id: ZN-231
title: 'System: Manifest contract: `app`, `permissions`, `scopes`, capability keys'
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 15:32'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies: []
ordinal: 52010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-02). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc.json accepts `app{id,name,version,icon,dock,urlSchemes,fileTypes,window}`, `permissions` with `-` per-target removal and `scopes`; a bad id or an unknown permission is a diagnostic with the line.
- [x] #2 `targets/capabilities.json` has the section 5.2 keys; a build for esp32 of an app that imports `zinc:system/tray` succeeds and resolves to the stub; with `"requires": ["tray"]` it fails with the capability message.
- [x] #3 Importing a system module without its permission fails at compile time naming the permission id (golden diagnostic).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc.json app{id,name,version,icon,copyright,category,dock,urlSchemes,fileTypes,window}, permissions (feature or feature:operation, 13 known features), scopes, targets.<t>.permissions with -id removal (permissionsFor); bad app.id and unknown permission stop the command (exit 2) with 'line N:'. Z5006 at compile time for zinc:system/<feature> without the permission (checker fixture + docs/diagnostics.md); stub modules lib/std/system/*.ts (isSupported() false) until ZN-232; capability keys desktop..power in targets/capabilities.json (macos/sim true, linux tray+shortcuts optional, others false); --profile esp32 with permissions tray resolves to the stub, with requires tray fails 'requires tray (esp32 has tray false)'. tests/t1/system_manifest.sh.
<!-- SECTION:NOTES:END -->
