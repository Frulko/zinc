---
id: ZN-129
title: fbdev file backend and evdev scripts
status: Backlog
assignee: []
created_date: '2026-10-06 23:00'
labels:
  - simulator
  - size-S
milestone: m-11
dependencies:
  - ZN-104
ordinal: 40710
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZINC_FBDEV_SIM with a fixed screeninfo for 16, 24 and 32 bpp and a scripted input_event stream (multitouch).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the three depths give the same PNG as the software raster; a multitouch script reaches zinc:gfx
<!-- AC:END -->
