---
id: ZN-849
title: 'CarPlay: Runnable Mac demo and connection lifecycle'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-28 21:07'
updated_date: '2026-10-28 21:30'
labels:
  - carplay
  - size-M
dependencies: []
ordinal: 558460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: a demo that runs. Keep CarPlay in plugins/carplay; improve launch, diagnostics and lifecycle. No fake successful iPhone authentication.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One documented command opens a useful native Zinc demo with deterministic media for hardware-free verification and a clearly separate live receiver mode
- [x] #2 Reconnect and keyboard or rotary controls are tested and demo is checked and captured on Mac
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Native offline launcher generates eight independently decodable H.264 frames and a PCM tone; distinct --live requires a URL. Verified native background window screenshot build/carplay/verified-native.png and headless capture. carplay proves auto reconnect, cancellation, malformed URL diagnostics, keyboard HID, preserved two-contact/day-night behavior, omitted-false session cleanup, plus integrated receiver-requested PCM/Opus mic start/stop. carplay_demo checks source, full offline loop/cleanup and missing live URL error. Both pass using /Users/mowmow/Lab/zinc/build/zinc read-only with this checkout ZINC_ROOT. External experimental identity consistency and real pinned-backend token-protected loopback startup verified; no physical iPhone acceptance claimed. USB ZN-847 and mic physical acceptance ZN-848 remain separate open/review work.

Session usage: n/a (tools/usage did not find API-session accounting). No engine rebuild, cross build, push or publish. Integration remains on Frulko/carplay-finish; original develop worktree untouched.

Additional regression passed: WebSocket policy close 1008 (invalid token) reports an access error and stops automatic retries instead of silently looping.
<!-- SECTION:NOTES:END -->
