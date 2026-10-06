---
id: ZN-128
title: 'Chip models wave 2: ST7789 + CST820, IS31FL3730'
status: Backlog
assignee: []
created_date: '2026-10-06 23:00'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-127
ordinal: 40700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Band renderer correctness (damage rectangles), orientation (madctl), touch controller scripts, Scroll pHAT matrix model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 board preset esp32-2432s022 renders its golden through the model; display-st7789 runs on the host
<!-- AC:END -->
