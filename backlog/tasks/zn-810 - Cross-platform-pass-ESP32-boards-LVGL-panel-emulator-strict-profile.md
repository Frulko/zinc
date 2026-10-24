---
id: ZN-810
title: 'Cross-platform pass: ESP32 boards (LVGL panel, emulator, strict profile)'
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-M
  - cross
milestone: m-18
dependencies: []
ordinal: 54500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- zinc:lvgl on the ESP32-2432S022: the Bench page at 24 and 64 objects (the console line of "Run"), then `JOIN_SLACK` at 2,048 and 8,192 px: it was tuned in esp32sim, which does not time the panel's transfers, and a joined area sends more pixels on the 10 MHz bus.
- zinc:lvgl on the ESP32-2432S022: the Lottie page (ThorVG at 64 x 64): fps, LVGL ms and the lowest free heap from the UART line; whether 80 or 96 px fits.
- `--emulator` and `--live` on Linux (never run) and Windows (refused today: starting and stopping esp32sim and its socket are POSIX-only).
- zinc:lvgl on the ESP32-2432S022: measure the Input page's scroll (fps and LVGL ms from the UART line every 5 s), then the panel at LCD_HZ 20 MHz (the i80 send of a full page is 12 ms at 10 MHz), `LV_ATTRIBUTE_FAST_MEM` in IRAM, and flash QIO; keep what the board holds.
- ZN-274: the 8-tween budget of transitions on a real ESP32.
- ZN-261: rebuild the esp32 prebuilt core so its host table carries host.gfxGradientPaint (T0 programs never call it).
- async-storage (plugins/async-storage): prove it on the strict profile (esp32): mergeItem's deep merge walks Dyn JSON, which the strict
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc:lvgl on ESP32-2432S022: Bench, Lottie and Input pages measured, JOIN_SLACK and LCD_HZ settled
- [ ] #2 --emulator/--live on Linux and Windows; esp32 core rebuilt with gfxGradientPaint
- [ ] #3 async-storage mergeItem on the strict profile; 8-tween budget
<!-- AC:END -->
