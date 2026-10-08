---
id: ZN-317
title: 'Kickstart templates: game-2d, desktop-app, dashboard, 3d, service, iot, eink'
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-08 23:49'
labels:
  - templates
  - examples
  - size-L
milestone: m-19
dependencies:
  - ZN-315
ordinal: 55020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Real starting points, each with README, assets, tests and the targets it supports: game-2d (scenes, input, sprites, sound, save file), desktop-app (shell, router, settings, dark mode, menus, tray), dashboard (charts, live data with a mock source), 3d (three.js scene with orbit controls), service (HTTP API, tests, systemd unit), iot (board.json, sensor and OLED, a `zinc sim` scenario), eink (reMarkable). Split into one subtask per template if it grows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each template creates a project that passes `zinc check` and `zinc test` on the interpreter
- [x] #2 the UI templates render a headless frame equal to their golden
- [x] #3 a T1 test creates every template in a temporary directory and runs the checks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-317.01..07: game-2d, desktop-app, dashboard, 3d, service, iot-board (templates/iot is the older GPIO template), eink; tests/t1/templates_kickstart.sh creates every template, runs zinc check, zinc test, its zinc sim scenarios and compares the UI templates' frames. Sound for game-2d: ZN-390. usage: n/a
<!-- SECTION:NOTES:END -->
