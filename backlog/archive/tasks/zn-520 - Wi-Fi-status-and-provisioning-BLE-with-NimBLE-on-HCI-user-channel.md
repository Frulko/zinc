---
id: ZN-520
title: 'Wi-Fi status and provisioning, BLE with NimBLE on HCI user channel'
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-516
ordinal: 288000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wi-Fi: status and join through NetworkManager (nmcli via zinc:process) or wpa_supplicant; RTL8723BS stays a staging driver. BLE: zinc:ble scan, advertise and a GATT peripheral on Apache NimBLE (Apache-2.0, the ESP-IDF host stack) over the Linux HCI user-channel socket, static-friendly and shared with the ESP32 target; DT needs uart-has-rtscts on UART3 for the H5 link. BlueZ D-Bus stays the path for the glibc flavour (ZN-245). (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a program lists nearby BLE advertisers with RSSI on a CHIP
- [ ] #2 a phone sees the CHIP advertising a service UUID and reads a characteristic
- [ ] #3 Wi-Fi status and join work from TypeScript on Debian trixie
- [ ] #4 the BLE layer builds for armv7-linux and runs its host-side tests without a radio
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-558. Wi-Fi and BLE on the CHIP: same subject as zinc:wifi/zinc:ble on Linux; carry the NimBLE-on-HCI option (static builds, no BlueZ) as an alternative backend. Verifier: Same zinc:wifi/zinc:ble API; ZN-558 (Backlog) covers scan, GATT and LE advertising over BlueZ/NetworkManager. Carry the NimBLE-on-HCI static backend (UART3 rtscts DT note) and the CHIP checks (phone reads a characteristic, Wi-Fi join on trixie) as criteria or a later.md line, since ZN-558's own ACs are Pi/VM only.
<!-- SECTION:NOTES:END -->
