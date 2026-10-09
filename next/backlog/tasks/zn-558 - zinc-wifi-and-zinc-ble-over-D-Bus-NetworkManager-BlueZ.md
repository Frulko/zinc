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
ordinal: 340240
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
