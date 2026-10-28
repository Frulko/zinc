---
id: ZN-848
title: 'CarPlay: Microphone uplink for Siri and calls'
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-28 21:07'
labels:
  - carplay
  - size-M
dependencies: []
ordinal: 557460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: complete the native CarPlay demo on Mac. Existing media decoder and PlayPort transport are in plugins/carplay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The separate plugin captures and encodes microphone audio requested by the receiver, with permission handling and cleanup
- [ ] #2 PCM and Opus uplink and lifecycle are proven by targeted automated tests
<!-- AC:END -->
