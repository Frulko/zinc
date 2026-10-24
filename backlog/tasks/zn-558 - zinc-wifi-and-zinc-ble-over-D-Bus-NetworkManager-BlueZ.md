---
id: ZN-558
title: 'zinc:wifi and zinc:ble over D-Bus (NetworkManager, BlueZ)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-L
milestone: m-25
dependencies:
  - ZN-535
ordinal: 52400
updated_date: '2026-10-25 01:53'
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
<!-- SECTION:NOTES:END -->
