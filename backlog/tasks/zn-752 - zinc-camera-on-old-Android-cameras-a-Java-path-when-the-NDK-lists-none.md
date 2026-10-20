---
id: ZN-752
title: 'zinc:camera on old Android cameras: a Java path when the NDK lists none'
status: Backlog
assignee: []
created_date: '2026-10-17 07:38'
labels:
  - mobile
  - media
  - size-M
milestone: m-26
dependencies:
  - ZN-628
ordinal: 210500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the owner on 2026-10-17 trying Zinc Go on the Nexus 7: the QR scanner showed the fake camera. The Nexus 7 2012's camera is a HAL 1 device (dumpsys media.camera: Device version 0x100, a Camera1 API shim), exposed to Camera2 at the LEGACY level, and the NDK's ACameraManager (plugins/camera/native/camera.android.cpp) does not list LEGACY devices, so zinc:camera finds no camera and falls back to the generated one. Add a Java backend through the phone plugin model (D127: plugin.json targets.android sources + native-gen glue): android.hardware.camera2 in Java (which does serve LEGACY devices) or the old android.hardware.Camera below that, frames delivered as NV21/YUV_420_888 to the same conversion; used when the NDK lists no camera or the device's level is LEGACY. Camera permission prompt included.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on the Nexus 7 zinc:camera lists its front camera and Zinc Go's scanner shows the real picture and reads a QR code from the Mac's screen
- [ ] #2 the API 37 emulator keeps the NDK path (its virtual camera unchanged)
- [ ] #3 a T0 test with no Android tool: the export tree carries the Java backend and the camera permission
<!-- AC:END -->
