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

The first transport slice extends the existing encrypted type-130 tunnel with optional duplex output. It acknowledges synchronous packages, delivers non-iAP command bodies, and sends encrypted command packages, including payloads split across frames. The existing receive-only iAP2 path remains the default. Full backend build/tests, overlay idempotence and a real local TCP crypto round-trip test pass.

The GPL backend now has a bounded Apple OPACK codec. A Vehicle State register response with back references from LIVI's protocol vectors decodes correctly; integer widths, nested requests, malformed input and size limits pass focused tests. The overlay is idempotent. No Ultra capability is advertised yet. Next: constrained vehicle description/request handler, UUID routing and physical phone acceptance.

29 October continuation: the receiver advertises `vehicleStateProtocol` only when `ZINC_CARPLAY_ULTRA_VEHICLE=1`, the phone offers it and the handler is installed. A physical Pi/iPhone session opened the high and normal Vehicle State UUIDs and exchanged two encrypted OPACK request/reply packages. The phone sent `comm` packages; duplex channel routing now delivers them to the vehicle parser while the legacy iAP2 channel remains receive-only. The Zinc player presets publish RPM and fuel to the receiver; phone writes to declared climate controls can be broadcast back to Zinc. Local backend and Zinc example checks pass. A WebSocket probe confirmed enabled=true and sent RPM/fuel, but no subscription to those IIDs or phone UI change was observed. UI sync, assets, full cluster composition, speed/gear wire mapping and physical climate write remain open; keep their ACs unchecked. The Pi service is experimental, disabled at boot, and must be stopped after the probe.

The live WebSocket probe after fixing overlay order received `ultraVehicle` snapshots with RPM 1900 and fuel 66 from the running Pi receiver. The overlay test now asserts the `ultraGauge` route exists. `:protocol:test` for the tunnel and vehicle state, `:server:installDist`, `build/zinc check examples/carplay` and the overlay idempotence check pass. The first physical probe caught the missing route despite a successful build; test and fix are in this change.

Climate UI continuation: the player can now send HVAC power (IID 514) and target Celsius (IID 520) with typed WebSocket values; the receiver validates their types and bounds through the same Vehicle State handler. The focused protocol test and Zinc example check pass. The Pi has not yet run this build and an iPhone climate-control write remains unobserved, so criterion #3 stays open.
