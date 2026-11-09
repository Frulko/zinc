---
id: ZN-805
title: >-
  Lighter exported and idle UI apps: link only what is used, idle redraw, memory
  owners
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-24 23:55'
updated_date: '2026-11-09 00:04'
labels:
  - size-L
milestone: m-21
dependencies: []
ordinal: 2200
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
- [x] #2 An app with no animation or input sleeps until an event (idle hello below 1% CPU)
- [ ] #3 Report names what holds the 25-90 MB RSS (atlas, fonts, tree, arenas) and the 14 threads; unused ones start lazily
- [ ] #4 Numbers logged in docs/reports/zinc-next-perf.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Research (sonnet sub-agent, 2026-11-09)
- SDL3 SDL_WaitEventTimeout waits on the video thread only, the timeout is a minimum; SDL_PushEvent from another thread wakes it (https://wiki.libsdl.org/SDL3/SDL_WaitEventTimeout, https://discourse.libsdl.org/t/sdl-modifies-waitevent-and-waiteventtimeout-to-actually-wait-instead-of-polling/31734).
- Godot low_processor_mode is a sleep of 6.9 ms, not a wait (https://docs.godotengine.org/en/4.0/classes/class_os.html); Flutter/GPUI only frame after scheduleFrame/notify.
- Electron embeds libuv in the Cocoa loop with a thread that select()s uv_backend_fd and wakes the main loop (node_bindings_mac): the upgrade path for socket wake-ups.
- SDL3 per-subsystem CMake toggles save tens to hundreds of KB, not MB (FreeBSD port note https://reviews-dev.freebsd.org/R11:bbea078ec9c0d8eaa3850d4e2be8f88f32ecac84); SDL_HAPTIC needs SDL_JOYSTICK.
- mimalloc options latch on first read; mi_collect(true) purges at idle (https://microsoft.github.io/mimalloc/environment.html). libuv's pool starts on first uv_queue_work/fs/getaddrinfo.

## Part 1: idle sleep (criterion 2)
- gfx_host.cpp HostGfxEnd: after 30 kept frames (zinc:ui keep, idle_run) with an empty present (idle_frame) and no button or finger down, the loop waits in the window HAL (SDL_WaitEventTimeout) until an event, the program's next timer (new row host.gfxIdleDue, given by the prelude's __gfxStep, QuickJS frameLoop and the Node-API driver from __nextAt) or 100 ms; a worker's message ends it (zn::loop::idleWake from wakeSend -> SDL_PushEvent of a registered event). Not with ZINC_FRAMES, deterministic runs, an unseen window (already paced), an app shell or headless.
- The step after an idle wait is not capped at 0.1 s: QuickJS and the Node-API engines add steps to their clock, the cap put their timers 60 ms late.
- idle_frame is written by the render thread: read and written with __atomic builtins now (runtime/zrt.cpp's reader left as it was).
- Proof (M1 Pro, another tree building: indicative): hello window, ps CPU over 10 s after 6 s: 0.80% without the wait (ZINC_FRAMES=1000000 disables it) -> 0.20%; tests/t1/idle_sleep.sh: 8.9 loop turns/s idle (60 before), one-second timer 6-8 ms late on interpreter, AOT and QuickJS.
- ponytail: libuv socket/fetch completions do not wake the wait (100 ms at most); later.md line below.
<!-- SECTION:NOTES:END -->
