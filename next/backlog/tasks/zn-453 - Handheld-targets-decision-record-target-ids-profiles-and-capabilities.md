---
id: ZN-453
title: 'Handheld targets: decision record, target ids, profiles and capabilities'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - targets
  - size-S
milestone: m-23
dependencies: []
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record a decision in docs/reports/zinc-next-decisions.md: targets psp, vita, n3ds, ios-legacy live in Zinc Next only (compiler/ untouched); two delivery paths per target, a prebuilt interpreter core plus program.zbc (no SDK for users, like the ESP32 core) and an AOT path (SDK needed); number profiles (psp f32: the Allegrex FPU is single precision); no libuv on the consoles. Add the four rows to next/src/frontend/profile.cpp and targets/capabilities.json (report docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md section 6.4). Also record the PocketJS/Pocket3D parity rules (docs/reports/hardware/pocketjs-pocket3d.md): AOT-only versus prebuilt interpreter core on consoles (the two reports differ: decide with numbers), one renderer per GPU over clean-room device kernels (the Pocket3D kernels carry a title-card licence), licence table of reusable sources and data (PLATEAU, OSM ODbL, CC0; no GoldSrc maps, no ROMs), and the iPhone 4S OS policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision entry written with the two delivery paths and the number profiles
- [ ] #2 profile rows psp (f32, 480x272, 16 MiB), vita (f64, 960x544, 192 MiB), n3ds (f64, 400x240, 16 MiB), ios-legacy (f64, 480x320 at scale 2, 96 MiB) exist and a T0 test looks them up
- [ ] #3 zinc run --profile psp examples/bouncing-ball runs in the host window with f32 numbers
- [ ] #4 capabilities.json rows validate against requires in the existing tests
<!-- AC:END -->
