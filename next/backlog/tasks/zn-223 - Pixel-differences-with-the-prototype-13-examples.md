---
id: ZN-223
title: 'Pixel differences with the prototype: 13 examples'
status: Backlog
assignee: []
created_date: '2026-10-07 10:44'
labels:
  - render
  - parity
dependencies: []
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tools/proto-capture compare lists the entries whose frame 30 differs from the prototype (known rows in tests/golden/examples/proto/manifest.json): small text/clock areas (esp32-2432s022, camera/remote, pocket-hero, process/shell, text/main-react, remarkable dashboard and notes, webview/hybrid) and whole-frame differences (pinball, three/cubes, video/bounce, looper, quad). Find each cause (time-dependent state, font rendering, plugin renderer), fix or justify with a tolerance, remove the known row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 every known row of the manifest is removed or has a documented tolerance
<!-- AC:END -->
