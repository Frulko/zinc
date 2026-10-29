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

Follow-up: explicit keyboard capture defaults to CarPlay and blocks Zinc focus acquisition. F6/header button releases to UI editing and F6/video click captures. Root-before-edit handler plus focus guard covered by real Zinc field editing test. Numbered contacts and mini pad visually verified from a script including negative native IDs; separate assigned flags fix negative-ID slot tracking. carplay/carplay_demo pass. Only viewer restart is needed for this change.

Owner follow-up: F7 / Trackpad ON-OFF independently toggles native contacts and markers. Immediate all-up report and slot reset on disable prevent stuck touches. F7 is tested in both keyboard ownership modes; receiver loopback verifies the release report.

Owner screenshot confirms actual stream111 960×360 and corrected ratio. HUD now renders navigation and incremental music metadata prominently; cluster backend dimensions configurable, validated even64..4096; bundled GPX load button, actual GPS write counters and per-sentence NMEA messages. Public iAP2 capability findings and unimplemented artwork/lanes/seek are recorded in the CarPlay report; no claim of physical GPS, trust/locked-phone, voice or wireless acceptance.

Validation: backend build/protocol/server tests, carplay, carplay_demo and carplay_usb pass. Final HUD fixture capture inspected; custom dimension validation and partial media updates have regression tests. Real custom resolution and populated music metadata still need phone acceptance.

Owner follow-up: live Apple Maps and Spotify metadata populated in screenshot. Implemented separate artwork session12 reception using pinned DiPlay stack/receiver and tests, bounded PNG/JPEG WebHub envelope, native HUD image matched to metadata ID and cleanup. Backend/server tests + carplay/carplay_demo/carplay_usb pass, synthetic cover screenshot inspected. Physical cover acceptance still pending restart/change song.
GPS remains open: read-only current receiver inspection showed subscribed=true, Paris fix, TX656→662 over3s. New requested-selector status and filtering match LIVI, but map following external fixes is not established. Encoding source diagnostic added; no guessed replacement: Unicode source/Frame.Text/realWS/JSON/render tests pass, live suspect source bytes still needed.

Owner supplied official chapter excerpts; read/rendered carplay.pdf printed409/411. Fixed omitted generic VehicleInformation in external-location profile, with USB/wireless and EV-no-duplication tests. Location chapter637–638 absent from excerpts; do not invent GNSS-mode messages. Owner observes Plans full HUD, Google Maps partial/no direction, Waze none; clear prior maneuver on source change.
Owner explicitly requested every possible iAP2 feature/data in both directions. Native inspector now exposes complete known catalog, unknown observed IDs, declared directions/capabilities, counts/subscriptions, decoded RX/TX journal, recording/export, bounded composer restricted to advertised TX on authenticated link. Uses existing session/formatter; sensitive auth/identity/Wi-Fi bodies hidden. Added known subscriptions and lane capacity, with schema/tests. Catalog-only functions are explicitly not claimed implemented. Physical GPS, covers, voice/day-night/trust/wireless acceptance remain open.
