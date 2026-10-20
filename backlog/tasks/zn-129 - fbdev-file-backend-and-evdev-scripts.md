---
id: ZN-129
title: fbdev file backend and evdev scripts
status: Done
assignee: []
created_date: '2026-10-06 23:00'
updated_date: '2026-10-07 14:44'
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
- [x] #1 the three depths give the same PNG as the software raster; a multitouch script reaches zinc:gfx
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. display-fbdev: ZINC_FBDEV_SIM=<file> (+ _FORMAT=WxHxBPP, _INPUT=<evdev script>) gives a fixed screeninfo (16 RGB565, 24 BGR bytes, 32 XRGB, padded pitch) and one SYN_REPORT of events per poll; tests/native/chip_fbdev.cpp builds the real driver on the host with linux/fb.h, kd.h, input.h stubs: 16/24/32 bpp give the same picture as the software surface (golden tests/golden/sim/fbdev.ppm), 2x letterbox, two-finger multitouch script reaches HalInput.touch (the struct zinc:gfx reads through HostGfxPoll). Committed on the HEAD blob of fbdev.cpp: the working copy holds another developer's uncommitted pool/FMT changes (kept), where one line (fmt reset on init) is mine and left for their commit. Not run on a real Linux kernel.
<!-- SECTION:NOTES:END -->
