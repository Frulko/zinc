---
id: ZN-805
title: >-
  Lighter exported and idle UI apps: link only what is used, idle redraw, memory
  owners
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-L
milestone: m-21
dependencies: []
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-713: a UI-only export with `"permissions": []` links Mbed TLS, libuv, llhttp, libwebp and every SDL3 subsystem (gamepad, haptics, Bluetooth, sensors, audio, camera): link them only when used; the 5.5 MB .app is larger than Tauri's 4.9 MB.
- ZN-713: 33 MB of the 65 MB footprint of a list app is the GPU context (OpenGL on the Intel Mac): measure the Metal path and a CPU-raster window for UI-only apps.
- ZN-713: 25 MB of malloc heap for 200 text rows, one field, one image: find what holds it (glyph atlas, baked fonts, node tree, mimalloc arenas); 14 threads in a one-window list app: name them, start the unused ones lazily.
- ZN-?: an app with no animation or input should not redraw; idle `hello` is 4.4% CPU against Flutter's 0.2% (perf-comparison-2026-10); confirm without a per-frame callback, sleep until an event or timer
- ZN-?: find what the ~90 MB RSS of a hello screen is (GL context, font atlas, allocator arenas) with `zinc mem` and `resmon`; PocketJS publishes 83 MB idle
- ZN-?: list frame p99 is 5.65 ms against a 0.56 ms median; pre-shape the rows just outside the viewport in idle time
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A UI-only export with permissions [] links no TLS, libuv, llhttp or unused SDL3 subsystems; size compared with the Tauri row
- [ ] #2 An app with no animation or input sleeps until an event (idle hello below 1% CPU)
- [ ] #3 Report names what holds the 25-90 MB RSS (atlas, fonts, tree, arenas) and the 14 threads; unused ones start lazily
- [ ] #4 Numbers logged in docs/reports/zinc-next-perf.md
<!-- AC:END -->
