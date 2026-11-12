---
id: ZN-558
title: 'zinc:wifi and zinc:ble over D-Bus (NetworkManager, BlueZ)'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-L
milestone: m-25
dependencies:
  - ZN-535
ordinal: 53200
updated_date: '2026-11-12 01:55'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sd-bus is loaded at run time. wifi: scan, connect, status and access-point mode through NetworkManager, with nmcli as fallback. ble: adapter power, scan with RSSI and advertisement data, GATT central read/write/notify, LE advertising. No SimpleBLE (BUSL-1.1). Needs the wifi and bluetooth permissions. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 mac80211_hwsim + hostapd + NetworkManager test passes in the CI VM
- [ ] #2 hci_vhci/btvirt BLE scan and GATT test passes in the CI VM
- [ ] #3 the Pi 3B+ scans and connects to a real access point and a real BLE peripheral
- [ ] #4 has() = false on boards without radio
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged ZN-520 here (Wi-Fi status and provisioning, BLE with NimBLE on HCI user channel). Carry over: Wi-Fi and BLE on the CHIP: same subject as zinc:wifi/zinc:ble on Linux; carry the NimBLE-on-HCI option (static builds, no BlueZ) as an alternative backend. Same zinc:wifi/zinc:ble API; ZN-558 (Backlog) covers scan, GATT and LE advertising over BlueZ/NetworkManager. Carry the NimBLE-on-HCI static backend (UART3 rtscts DT note) and the CHIP checks (phone reads a characteristic, Wi-Fi join on trixie) as criteria or a later.md line, since ZN-558's own ACs are Pi/VM only.
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)


2026-11-12 verified software checkpoint (worker branch work/558-radios; task remains Backlog, no AC checked):

- Added the private runtime-loaded sd-bus function table, bounded async calls/polling, typed message codec, RAII cancellation, reply-size/depth/node limits, generation invalidation and sanitized error names. Uses the OS LGPL libsystemd dynamically only, no vendored systemd/no static link/no new dependency. Source: plugins/radio/native/sd_bus.h.
- Added the Linux NetworkManager backend and zinc:wifi plugin: observed DeviceType=Wi-Fi presence, GetDevices/GetAll status, RequestScan then LastScan/GetAllAccessPoints, binary SSID preservation, open/WPA-PSK activation, explicit capable-device AP/shared-IPv4 settings. Activation method acceptance is not completion: actual Device.State=100 must refer to this client's active-connection path. Volatile, non-autoconnect, dbus-client-bound connections end with this client; cleanup never deletes an unrelated saved profile. Device/daemon removal and transport failure clear stale observations; retry starts a fresh generation. No automatic radio power, auth prompt, credential retry, timezone/SNTP or captive portal.
- Kept ESP32 ambient declarations, adding optional byte SSID/strength fields and Linux methods; its firmware module is unchanged. Registered the wifi permission in the project parser (only core change). HostWifi denies before making any bus calls. Existing BLE native/public/macOS files are untouched; no BLE replacement or API completion claim.
- Exact proof: tests/run --only radios PASS (~7s indicative, memory unmeasured); injected sd-bus ABI table exercises the production codec/requests, no service or radio: absent adapter, binary SSID, scan completion, requested activation versus unrelated/actual active connection, secret-free failures, WPA/AP settings, duplicate activation rejection, removal/restart/cancelled replies, depth limit, transport loss, 32-message work cap. Includes actual NativeWifi permission denial (zero bus slots/requests) and source project-parser permission regression. ASan/UBSan targeted protocol executable passed. Linux aarch64 host object compiled warning-free with installed pinned Zig. Idle public native fixture tests/data/radios/public.ts passed interpreter, AOT and QuickJS with ZINC_NATIVE=real; it never starts observation or calls a radio. Common read-only binary source b4929e91c, SHA256 005ed685cbeb2b41394d6b573d7e7c1980a1208ff299ac0eb2e89ceeed5a17a2. ZINC_ROOT points to this worker tree. All heavy commands used /Users/mowmow/Lab/zinc/tools/work-run; no owned process remains.
- Research consumed in full: main .logs/research-558-dbus.txt (copied into worker .logs). Primary ABI checked against https://raw.githubusercontent.com/systemd/systemd/main/src/systemd/sd-bus.h ; async semantics https://freedesktop.org/software/systemd/man/latest/sd_bus_call_async.html ; NM methods/settings https://networkmanager.pages.freedesktop.org/NetworkManager/NetworkManager/gdbus-org.freedesktop.NetworkManager.html and https://networkmanager.dev/docs/api/latest/nm-settings-dbus.html . The dynamically loaded system library fits the binding LGPL exception; no SimpleBLE or sdbus-c++ added.

Software still open before Review: bounded nonblocking nmcli fallback (argv/no shell/escaped output; no secrets in argv or logs); BlueZ adapter power/discovery with RSSI+raw advertisements, generic GATT central read/write/notify, exported LE advertisement AND UART GATT application preserving current BLE callbacks/native/macOS contract, additive generic API/simulator/docs; tests of those actual production request/parser paths. The four task ACs remain entirely open: neither simulated sd-bus objects nor an idle Mac fixture proves mac80211_hwsim/NM CI, btvirt/GATT CI, real Pi connections or observed radio-less boards. Static NimBLE/HCI and CHIP UART3/rtscts remain the carried alternative, not implemented here.

Next worker: start from local develop in a fresh 558 worktree, cherry-pick this verified checkpoint, read docs/plugins/wifi.md, plugins/radio/native/sd_bus.h, plugins/wifi/native/network_manager.h, tests/native/radios/* and the full research log; continue nmcli and then BlueZ. Keep task Backlog until software is complete; no full feature changelog claim. Full command/proof provenance and limits in worker .logs/HANDOFF-558.md (archive whole .logs before deleting tree).

Proposed decision/later lines for coordinator (no number allocated): direct dynamically loaded sd-bus behind one private function table, because a proven OS bus implementation avoids a new wire protocol/static LGPL dependency. Revisit only for a static non-systemd target; preserve NimBLE alternative separately. D316 generated-thunk static arrays/factory-global ownership, concurrent VM/allocator/reload cleanup remain unproven; the native object's mutex does not prove them. Explicit stop() required. Wi-Fi fallback/BlueZ are existing task scope, not new later tasks.

Proposed tests (owner-selected only): after software completion, bounded mac80211_hwsim/hostapd/NM and btvirt/GATT CI-VM scenarios (10–20s each, memory unmeasured); Pi3 actual scan/join/peripheral and explicit AP/LE peripheral smoke (10–20s each, memory unmeasured); actual no-radio-board has() observation (10s). No privileged VM/radio setup, network changes, hardware probe, emulator, suite/T1/T2/demo/pixel/benchmark/conformance/fuzz/CI run was started. usage: n/a.

<!-- SECTION:NOTES:END -->
