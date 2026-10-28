---
id: ZN-854
title: 'CarPlay: debug GPS, cluster, telemetry and persistent trust'
status: Review
assignee: []
created_date: '2026-10-28 23:00'
labels: []
dependencies: []
ordinal: 559460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Native debug player edits GPS and GPX timeline with subscription-aware injection
- [x] #2 Independent cluster preview, decoded iAP2 HUD logs, two-contact and keyboard controls have targeted proof
- [ ] #3 Saved USB pairing avoids repeated Pair and preserves trust while locked
- [x] #4 macOS and Linux BlueZ wireless launch paths are documented and locally tested where possible
<!-- AC:END -->

## Implementation Notes

Owner explicitly requested native GPS presets/GPX timeline, secondary screen/HUD telemetry, multitouch/keyboard, saved trust/lock handling, and Mac/Pi wireless. Implementation in separate CarPlay plugin/backend, with one generic opt-in HAL input flag for raw indirect absolute trackpad contacts.

Automated: backend protocol/server tests cover location subscription/NMEA, bounded secure GPX interpolation/timeline, pre-session control routing, partial HUD state, private pair-store persistence and narrow re-pair classification. carplay/carplay_demo pass against read-only main engine; both decoder streams, existing two-finger/keyboard protocol, sidebar capture. trackpad_touch and carplay_wireless pass (BlueZ binary pump is simulated on Mac). Full backend builds pass, including cluster-enabled configuration.

AC3 remains pending physical repeat-start/locked-phone acceptance: files/IDs/keys persist privately and policy tests pass, but no saved StartSession has been accepted on the real phone yet. New GPS/cluster/trackpad and all physical wireless remain manual acceptance. No Pi/Linux build/test was run. First persistent startup may need one final Trust confirmation. Existing successful USB image/audio remains the prior physical proof.

Use this worktree's freshly built engine for ZINC_TRACKPAD_TOUCHES=1; the main tree binary was not modified. Next commands are documented in examples/carplay/README.md and plugins/carplay/backend/linux/README.md.

Final worktree validation: tools/build zinc completed; this worktree's build/zinc passes input_touch, carplay and carplay_demo. Generic trackpad_touch and carplay_wireless pass. carplay_usb passes against the built external receiver. Full final backend build/tests pass with bounded WebSocket input and complete debug snapshots; cluster-enabled server routing tests also pass. Manual wireless --help runs through the wrapper without touching Bluetooth. Main worktree binary remains untouched.
