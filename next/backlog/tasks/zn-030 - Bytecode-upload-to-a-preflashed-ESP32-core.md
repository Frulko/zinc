---
id: ZN-030
title: Bytecode upload to a preflashed ESP32 core
status: Review
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 16:35'
labels:
  - size-L
milestone: m-6
dependencies: []
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: `zinc run hello.ts --target esp32` runs on a device with no manual install step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc run hello.ts --target esp32` runs on a device with no manual install step.
- [x] #2 M6 demo: hello on ESP32 (QEMU first) with no manual install
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: device core + upload protocol (include/zn/devproto.h, src/dev, zinc device-sim), ESP-IDF 5.5.5 core firmware (firmware/esp32, image prebuilt/esp32-core-flash.bin 690 KB, tools/build-esp32-core), zinc run --target esp32 [--port|--qemu|--device], zinc flash --target esp32 (esptool v5.4.0 pinned and verified), Espressif QEMU 9.2.2 pinned and verified. Interpreter stacks are now sized per machine (Machine::stackSlots/maxDepth) with a stack check on calls. Checked: T0 device.sh (protocol through the simulator), T2 esp32_qemu.sh (hello, library golden, exception on the emulated ESP32; free heap 281 KB at start). Not checked: AC1 on a physical board (none attached): needs a board to run zinc flash and zinc run.
<!-- SECTION:NOTES:END -->
