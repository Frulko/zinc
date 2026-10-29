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
- [x] #2 Vehicle state and UI sync type-130 channels exchange validated bidirectional messages with an iPhone
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

UI Sync slice: added bounded OPACK/plist reset and command handling, cluster panel descriptors, and a separate `ZINC_CARPLAY_ULTRA_UI_SYNC=1` gate. Phone layout/palette/appearance choices reach the Zinc debug log if the channel opens. `UltraUiSyncTest`, backend installation and fresh/repeated overlay checks pass. A Pi/iPhone wireless session offered and enabled `uiSync`, completed `/info` and projected classic 110/111 video, but did **not** open the UI Sync UUID during observation. There are no authenticated theme assets or a composed dashboard yet, so #2 and #4 stay open. The Pi unit is stopped and its UI Sync flag removed after the probe. Next: reproduce the phone's theme package and layout exchange from a protocol trace, then verify UI Sync stream traffic; do not equate the accepted feature bit with working Ultra.

Theme/layout continuation: Apple CarDDP catalog asset `44C9FA31EC` version 985 has SDK 19.0 and display IDs `Center_Display` / `Cluster_Display`. Its catalog measurement matched the downloaded ZIP; the package signature chain was not independently verified and no artwork was committed. With explicit `ZINC_CARPLAY_ULTRA_THEME=44C9FA31EC:985`, cluster and UI Sync flags, the Pi/iPhone session opened the UI Sync UUID `07D9F906-8D64-4B54-A808-A20BCA2C51C2`, exchanged reset/ack commands, and then received four replies to the Cobranded layout request followed by phone choices. Both classic video streams remained active. The backend forwards typed layout/palette/appearance choices to Zinc; the Mac dashboard composes local speed, projected navigation and RPM zones and uses its Day/Night action to request an updated UI Sync appearance. The second restart reached iAP2 0x4301 but the phone did not join the Pi AP, so this last player/appearance revision has only local checks. #2 is complete; #1, #3–#5 remain open. The Pi unit is disabled and stopped; its opt-in drop-in and staged JARs remain for the next probe. No Pi display was used.
