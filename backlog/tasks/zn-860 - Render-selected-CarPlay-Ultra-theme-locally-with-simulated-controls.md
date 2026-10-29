---
id: ZN-860
title: Render selected CarPlay Ultra theme locally with simulated controls
status: Done
assignee: []
created_date: '2026-10-29 15:30'
labels:
  - carplay
milestone: m-25
dependencies: []
ordinal: 562460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Player shows selectable local instrument themes, including topographic orange, with projected cluster navigation
- [x] #2 Vehicle, radio and climate simulator controls are visible and labelled; supported vehicle values still use Vehicle State
- [x] #3 Theme follows a recognized iPhone UI Sync palette without claiming to render the Apple package
- [x] #4 Focused CarPlay demo check passes
<!-- AC:END -->

## Final Summary

Added four original Zinc dashboard compositions and interactive local Voiture/Radio/Climat simulations. The live Pi UI Sync snapshot exposed layout `1B0484EC-1933-524D-80F8-2FC1FC7B4B2D` with palette `orange`; the local topographic composition follows that palette when received. The receiver's fixed test layout request is now opt-in, so it does not replace an iPhone choice by default. The player still cannot render the Apple CarDDP Core Animation package or supply the full native iPhone app services. `tests/run --only carplay_demo`, `UltraUiSyncTest` and the backend overlay check pass. The iPhone reconnected after deployment but did not send a fresh layout choice during the short observation.

The composition now leaves the contours visible while the projected cluster has no active route. Verified by a headless frame with no route and a live Mac viewer connected to the Pi.
