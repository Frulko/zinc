---
id: ZN-143
title: 'Zinc Atelier: editor, run on simulators, device panel, profiler views'
status: Backlog
assignee: []
created_date: '2026-10-06 23:02'
labels:
  - app
  - size-L
milestone: m-10
dependencies:
  - ZN-142
  - ZN-141
  - ZN-131
  - ZN-133
ordinal: 40850
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bring the app shell (app/atelier) to the ZincStudio feature set that applies: tree-sitter highlighting and LSP diagnostics inline, run on the interpreter/AOT/QuickJS and on the simulators (device-sim boards, ESP32 QEMU, qemu-user Pi), the device panel, flame graph from `zinc profile`, frames from ZINC_TRACE, settings. Uses only the CLI and the host library (no private paths).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 T1 pixel goldens for each view; a scripted session edits a file, sees an inline diagnostic, runs it on device-sim and opens its profile
<!-- AC:END -->
