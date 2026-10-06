---
id: ZN-100
title: plugin.json v2 and plugin discovery in the host
status: Backlog
assignee: []
created_date: '2026-10-06 22:55'
labels:
  - plugins
  - size-S
milestone: m-9
dependencies:
  - ZN-059
ordinal: 40420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full manifest per docs/reports/parity/03 section 3: entry, native specs, per-target sources and defines, options mapped to ZP_* defines, requires, libs (system/pkg-config), kind display; search path as today (plugins/ of the engine and of the project); `zinc plugins` listing with verified capabilities.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 all 33 manifests load; unknown keys warn once; `zinc plugins` output equals the prototype's fields
- [ ] #2 options of zinc.json reach the plugin (3d.scale)
<!-- AC:END -->
