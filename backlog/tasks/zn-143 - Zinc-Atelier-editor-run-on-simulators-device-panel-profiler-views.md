---
id: ZN-143
title: 'Atelier: profile view and run on the device simulators'
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
  - ZN-313
  - ZN-133
ordinal: 1200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Add a profile view (flame graph from `zinc profile`, frames from ZINC_TRACE) and a Run-on-simulator choice (devices/ presets of `zinc run --simulate`) to app/atelier; one scripted golden session. Already there: Device panel: app/atelier devices panel + tests/t1/atelier_devices.sh (ZN-729.06); inline diagnostics and LSP: ZN-728/732, tests/t1/atelier_ide.sh; app/devicesim exists.

Bring the app shell (app/atelier) to the ZincStudio feature set that applies: tree-sitter highlighting and LSP diagnostics inline, run on the interpreter/AOT/QuickJS and on the simulators (device-sim boards, ESP32 QEMU, qemu-user Pi), the device panel, flame graph from `zinc profile`, frames from ZINC_TRACE, settings. Uses only the CLI and the host library (no private paths).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 T1 pixel goldens for each view; a scripted session edits a file, sees an inline diagnostic, runs it on device-sim and opens its profile
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Highlighting, LSP diagnostics, run on interpreter/AOT/QuickJS and the device panel exist. No profile view in app/atelier (no flame graph, no ZINC_TRACE frames view), no run on the device simulators or QEMU boards. Evidence: Device panel: app/atelier devices panel + tests/t1/atelier_devices.sh (ZN-729.06); inline diagnostics and LSP: ZN-728/732, tests/t1/atelier_ide.sh; app/devicesim exists
<!-- SECTION:NOTES:END -->
