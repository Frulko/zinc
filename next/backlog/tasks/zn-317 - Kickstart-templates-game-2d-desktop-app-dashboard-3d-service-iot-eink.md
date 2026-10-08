---
id: ZN-317
title: 'Kickstart templates: game-2d, desktop-app, dashboard, 3d, service, iot, eink'
status: In Progress
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-08 23:21'
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
- [ ] #1 each template creates a project that passes `zinc check` and `zinc test` on the interpreter
- [ ] #2 the UI templates render a headless frame equal to their golden
- [ ] #3 a T1 test creates every template in a temporary directory and runs the checks
<!-- AC:END -->
