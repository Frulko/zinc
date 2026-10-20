---
id: ZN-050
title: 'The app shell Zinc Atelier (a zinc:ui app)'
status: Done
assignee: []
created_date: '2026-10-06 16:42'
updated_date: '2026-10-06 18:08'
labels:
  - size-L
dependencies: []
ordinal: 32300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The desktop app, written in Zinc on zinc:ui: project browser, text editor with diagnostics, run and stop, device panel (serial ports, flash, run on ESP32 or the emulator), output and profiler views (frame phases, flame graph from zinc profile), settings. Name decided in ZN-031.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 open a project, edit, run it in a window and see diagnostics
- [x] #2 run the same program on the emulated ESP32 from the app
- [x] #3 profiler views load zinc profile and ZINC_TRACE files
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. App in app/atelier (main.tsx, model.ts), new zinc:process host module, ZINC_SIZE, ZINC_BIN; fixed the scripted input of the headless HAL (events repeated every frame). T0 atelier, T1 atelier (3 pixel goldens + edit/save), T2 atelier_esp32. Found: Dyn programs cannot use zinc:ui; kit props are static. Not done: flame graph, serial ports/flash UI, settings.
<!-- SECTION:NOTES:END -->
