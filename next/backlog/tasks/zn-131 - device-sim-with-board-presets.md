---
id: ZN-131
title: device-sim with board presets
status: Review
assignee: []
created_date: '2026-10-06 23:00'
updated_date: '2026-10-07 14:53'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-128
  - ZN-125
ordinal: 40730
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc device-sim --board <preset>` runs the ESP32 core with the board's chip models and a window; the core reports its modules and `zinc run` checks imports before upload.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 s3-matrix demos run in a window with tilt from the mouse; uploading a program that needs a missing module fails early with the module name
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: the device core lists its host modules in the ready line (devproto.h, CoreConfig.reportModules/modules), upload() refuses before the load line when the program imports a host module (builtin zinc:* with __host calls, found by scanning the loaded sources) the device does not list, naming it: 'the program imports 'zinc:gfx' but the device does not provide it (it has: zinc:sys)'; zinc device-sim --modules <list> and --board <preset> (display -> zinc:gfx, imu-qmi8658 -> zinc:imu); a core that lists nothing (the prebuilt firmware) is not checked; tests/t1/device_modules.sh. Open (AC1 first half): the s3-matrix demos in a window with mouse tilt need the device core to have a frame surface and the imu (ZN-313), the core has no graphics today. Plugin modules (zinc:imu) are not in the early check yet; the firmware main.cpp does not report modules until the image is rebuilt.
<!-- SECTION:NOTES:END -->
