---
id: ZN-858
title: CarPlay Ultra vehicle state and composed display
status: In Progress
assignee: []
created_date: '2026-10-29 10:50'
labels: []
dependencies: []
ordinal: 560460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pi and Mac negotiate Ultra capabilities only when their channel handlers are ready
- [ ] #2 Vehicle state and UI sync type-130 channels exchange validated bidirectional messages with an iPhone
- [ ] #3 Simulated speed, RPM, fuel and climate changes reach the iPhone and phone changes appear in Zinc
- [ ] #4 Authenticated theme assets and synchronized cluster composition render in the Mac player without taking the Pi screen
- [ ] #5 Wireless reconnect, classic fallback and Pi performance are verified with targeted tests and real phone traces
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use the proven GPL receiver seam. Verify each protocol layer on the Pi before advertising it; keep Zinc player separate and Mac display active.
<!-- SECTION:PLAN:END -->

## Implementation Notes

Live Pi/iPhone test: a Mac WebSocket client received `phoneOffersVehicleState=true` and `phoneOffersUiSync=true`, with both receiver-enabled fields false. The Pi service was stopped after the probe; no display switch was made.

The first transport slice extends the existing encrypted type-130 tunnel with optional duplex output. It acknowledges synchronous packages, delivers non-iAP command bodies, and sends encrypted command packages, including payloads split across frames. The existing receive-only iAP2 path remains the default. Full backend build/tests, overlay idempotence and a real local TCP crypto round-trip test pass. No Ultra capability is advertised yet. Next: OPACK codec and a constrained vehicle description/request handler, then UUID routing and physical phone acceptance.
