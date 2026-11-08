---
id: ZN-1060
title: 'reMarkable Paper Pro: app and ink checks'
status: Backlog
assignee: []
created_date: '2026-11-07 16:41'
labels:
  - remarkable
  - cross
  - size-M
  - parked
milestone: m-29
dependencies: []
ordinal: 102400
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tablet checks for app/web, Zinc Read and ink.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-844: run app/web on the reMarkable Paper Pro and the Move (954x1696): pinch from AppLoad's touches, pen ink, link taps and Refresh.
- ZN-844: try the web dashboard on the tablet: a 5-minute period while minimized and as a widget, and whether the full refresh after a swap leaves no ghost.
- ZN-844: check that `tools/package --linux-arch aarch64` builds `plugins/pdf/prebuilt/linux`, that the tablet loads `lib/libpdfium.so` and draws a page; time one page render at 1620x2160 on the A53.
- ZN-844: add the x86_64, Windows and armv7 archives of PDFium `chromium/8100` to `plugins/pdf/vendor/PIN` and `fetch`.
- ZN-844: Zinc Read on the tablet: swipes, the pen, task ticks and a real Notion sync over Wi-Fi (HTTPS through mbedTLS).
- ZN-844: run `rmpp_lease` (zig cross build) and check that `zinc export --target rmpp` writes the app's SVG icon as the tile's icon.png.
- ZN-?: check `plugins/ink` native (ink.abi.cpp) on wasm, rpi1 and rmpp; `refreshRect` on L2/rm2fb and the real qtfb (needs the AppLoad patch 0004).
- ZN-?: run the Murdoku frames and `murdoku_pen` through the real rmpp driver in landscape and docked, on AOT and QuickJS; real Paper Pro: landscape rotation direction, `pen_rotate` per model, digitizer mapping, palm rejection delay (300 ms unproven), docked header height and tap offset in landscape, Move (954x1696) header and 2x ratio.
- ZN-?: measure `recognise` (the int8 net, 0.38 ms on the M1 Pro) on the rmpp (Cortex-A55) and the Pi (A53) with the cross-built engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 app/web runs on Paper Pro and Move: pinch, pen, links, refresh, the dashboard period
- [ ] #2 PDFium archives pinned for x86_64, Windows and armv7; the aarch64 package loads and draws a page
- [ ] #3 Zinc Read swipes, pen, task ticks and Notion sync; rmpp_lease and export icon
- [ ] #4 ink native on wasm, rpi1 and rmpp; Murdoku through the real driver; recognise timed on the A55 and A53
<!-- AC:END -->
