---
id: ZN-533
title: 'PocketCHIP audio through zinc:audio'
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-390
  - ZN-513
ordinal: 320210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc:audio (ZN-390, miniaudio) on sun4i-codec: ALSA backend in the glibc flavour, a tinyalsa (BSD) custom miniaudio backend in the static armv7-linux flavour; speaker and headphone routing on the PocketCHIP. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the game-2d template plays its sounds on the PocketCHIP speaker
- [ ] #2 output latency measured and recorded
- [ ] #3 the static flavour has no libasound dependency
<!-- AC:END -->
