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

Owner explicitly authorized Pi pretests overnight. Debian13 Pi3B+ via spark@192.168.2.33: Java21, PyBluez, powered BlueZ, private software identity, JVM distribution deployed. Corrected PyBluez local-address EINVAL using bluetoothctl and added a regression test. Added environment Wi-Fi secret support to pinned receiver overlay and a private per-user wireless state path; Mac wireless no longer fails on root-owned USB state. Pi AP+STA concurrent channel36 works, with AP 10.77.0.1/DHCP/DNS and remote WebSocket iap2Status while AirPlay bound to AP. Private start-wireless launcher and NetworkManager profile prepared on Pi; AP and receiver stopped after tests. iPhone is paired to the Mac, not yet Pi; no Bluetooth handoff or actual wireless stream accepted. Exact tomorrow steps in backend/linux/README.md.

BlueZ temporary ProfileManager registration advertises the official accessory CarPlay UUID in Classic Bluetooth EIR. Real Pi smoke observed UUID/name/pairability/discoverability while active and full restoration after SIGTERM. Private Pi launcher now supervises advertiser, receiver and AP cleanup; cold launch reached AirPlay/HTTP readiness with an intentionally invalid phone address, then left Potatoes connected and no AP/receiver running. `python3-dbus`/`python3-gi` installed. Generic NetworkManager AP may still lack Apple-specific Wi-Fi information elements. iPhone pairing and handoff remain physical acceptance; no no-chip compatibility claim yet.

29 Oct owner test: Pi bridge failed `Errno 77 File descriptor in bad state`. `strace` showed PyBluez issuing `connect` again after `EINPROGRESS`; Python stdlib RFCOMM socket reached `SO_ERROR=0` with one call. Bridge now uses it, with focused success/failure tests. Updated helper deployed to Pi without stopping the user's receiver. Pi live inspector reports authenticated iAP2, five subscriptions, RX power/network/call/media and two TX Wi-Fi configurations; `ap0` has a station at 10.77.0.162 and Bonjour answers an on-AP query. No wireless `0x4300`/`0x4301` or RTSP client observed, so wireless projection remains unverified. Pi iPhone Bluetooth trust set once with `bluetoothctl trust`.

Owner screenshot: main screen switches day/night, stream111 cluster remains dark. Appearance updates now address both main and cluster UUIDs when cluster is enabled, with plist round-trip tests; needs real receiver restart and phone validation. Waze trace `0x5201 state=0`, `sourceName=Waze`, `sourceSupportsGuidance=0` now preserves Waze in HUD and explains absence of guidance. Regression test found and fixed metadata-only `0x5201` spuriously reactivating a stopped route. iAP2 capability recap added at docs/reports/zinc-next-carplay-iap2-capabilities.md, including phone-state RX and TX limits. Current backend build/tests, carplay_wireless, carplay, carplay_demo pass. AC3 stays open; GPS/cluster/RTSP physical acceptance also open.

Owner wireless screenshot showed iOS unable to connect to Pi Bluetooth MAC. Receiver restarted cleanly with full private iAP2 trace and INFO handoff milestones, upgraded server/protocol JARs deployed. Current repeated RFCOMM failure is `Errno 111 Connection refused`, not old `Errno 77`; phone needs to initiate/reaccept. Direct physical Ethernet Mac en12 169.254.133.75 ↔ Pi eth0 169.254.23.158 is SSH-verified with existing key; temporary Pi host route corrects return path. Pi wlan0 disconnected from Potatoes while ap0 10.77.0.1 remains active on ch36. WebSocket viewer link over Ethernet verified. Two-terminal instructions in backend/linux/README.md; Pi private log path `~/zinc-carplay/logs/wireless.log`. No RTSP/CarPlay session yet.

Further live retry: iPhone discovered both local CarPlay and iAP2 accessory SDP records after the missing accessory UUID (`00000000-deca-fade-deca-deafdecacaff`) was added to the BlueZ advertisement. DiPlay and xcertplay both initiate RFCOMM to the iPhone's distinct `...cafe` service; an attempted incoming-only bridge was discarded before commit. HCI then showed BlueZ sending a negative user confirmation because no pairing agent ran; a temporary `NoInputNoOutput` agent restricted to this iPhone address now registers with the advertiser. A later HCI capture showed `PIN or Key Missing` while the Pi supplied its old link key, indicating stale pairing on one side. Removed only the iPhone pairing record on the Pi; owner was instructed to forget PlayPort Pi in iPhone CarPlay/Bluetooth settings and re-pair. Private captures containing keys were deleted after diagnosis. Agent address gate passed an assert-based Pi self-check; `carplay_wireless` and Pi Python syntax passed. Physical re-pair and wireless RTSP remain open.

Owner re-paired successfully: Pi reports phone paired/trusted, wireless RFCOMM and both iAP2 authentications succeeded, phone joined `ap0` at `10.77.0.162`, AirPlay RTSP became active, and the first video frame rendered. Opus type 102 received 1200+ decrypted packets with zero auth failures and no continuing sequence gaps. Owner reports nearly smooth video but severely choppy audio. Native `zinc:audio` previously cut a 500 ms burst from 24,000 frames to 2,880 frames, dropping 21,120; Pi log shows 383–406 ms maximum inter-read gaps. Type 102 now primes at 500 ms and retains up to 900 ms, while calls keep 60/180 ms. Native golden with three 400 ms bursts reports zero drops and underruns; `audio`, `carplay`, `carplay_wireless`, `carplay_demo` and `web_plugins` pass. Restart only the Zinc viewer for physical listening; no Pi receiver restart needed. Audio quality and added playback delay still require owner acceptance. USB lock/trust AC3 remains open.
