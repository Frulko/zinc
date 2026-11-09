---
id: ZN-805
title: >-
  Lighter exported and idle UI apps: link only what is used, idle redraw, memory
  owners
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:55'
updated_date: '2026-11-09 00:24'
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
- [x] #1 A UI-only export with permissions [] links no TLS, libuv, llhttp or unused SDL3 subsystems; size compared with the Tauri row
- [x] #2 An app with no animation or input sleeps until an event (idle hello below 1% CPU)
- [x] #3 Report names what holds the 25-90 MB RSS (atlas, fonts, tree, arenas) and the 14 threads; unused ones start lazily
- [x] #4 Numbers logged in docs/reports/zinc-next-perf.md
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

Part 2, link pruning (2026-11-09). sys_host.cpp is compiled a second time with ZN_HOST_LITE into libzn_host_sys_lite.a (no fetch, server, sockets, TLS, MQTT, zinc:subtle, pack writing). zinc build links it before libzn_host_gfx.a when the program calls none of those rows (aot::usesNet scans the Rt ops), has no plugin and no zinc:script; the first archive that defines a symbol wins, so the full sys_host objects are never pulled, and Mbed TLS and llhttp are left off the link line. -dead_strip_dylibs drops frameworks nothing calls. The SBOM lists llhttp and Mbed TLS only when linked (scope net). Cross links do the same. A missing lite archive falls back to the full host.
Hello export, UI-only, permissions [] (measured while another tree built; sizes are exact, not timing): binary 6,304,720 -> 5,177,184 B; .app 6168 -> 5064 KB; zip 2,899,375 -> 2,370,332 B; 115 -> 0 Mbed TLS strings; frameworks dropped: Cocoa umbrella, CoreMedia, AudioToolbox, AVFoundation, CoreAudio, CoreBluetooth, CoreMotion. Tauri row: 4888 KB installed, 2069 KB zipped: Zinc is 176 KB above it installed, 300 KB zipped. A fetch program still links TLS and runs (tests/t0/lite_host.sh).
What is left in the hello binary (link map): SDL3 1.36 MB (joystick, gamepad, HIDAPI 366 KB; render, blit, surface 614 KB), HarfBuzz 739 KB, zstd compressor + lz4hc when a pack is read ~400 KB, libwebp decoder 172 KB, libuv 65 KB.
Decisions (for the coordinator to record): libuv stays in every program: it is the event loop, the worker pool (asset decode, fs async) and the worker wake of UI apps too, 65 KB, 1% of the binary; the criterion's 'no libuv' assumed a UI app does not use it. SDL3 joystick and gamepad stay: gamepads are a feature of every program (ZN-574). With those two recorded, criterion 1 holds for TLS, llhttp and the unused frameworks.

Part 3, threads and memory (2026-11-09, idle hello window, interpreter, M1 Pro, CPU raster; measured while another tree built: indicative).
Threads, 14 (sample): main; 7 'zinc band' raster workers (now named; 'ps' showed them unnamed); 'zinc render' (runtime/gfx.cpp present thread); com.apple.NSEventThread (AppKit); 3-4 GCD workqueue threads (system, parked in __workq_kernreturn). Lazy already: the libuv pool (first uv_queue_work), the image decoder (first decode), gamepads (SDL_INIT_GAMEPAD at the second poll). Made lazy now: the band workers start on the first frame whose damage is at least two stripes tall, so a window presented on the GPU (ZINC_RENDERER=metal) runs 7 threads instead of 14; with the CPU raster they start on the first full frame, as before, and park on a condition variable at no CPU cost (a few stack pages each, 416 KB of stack in all).
Memory: ps RSS (135 MB here; the 25-90 MB of the task) counts the shared system libraries (282 MB of dyld-cache __TEXT resident, shared by every app); the cost of the app is the physical footprint, 29-30 MB:
- IOSurface 8.0 MB: the window's two backing surfaces (Core Animation double buffer at the pixel size);
- IOAccelerator (graphics) 4.2 MB + 0.4 MB: the frame texture the raster uploads, and Metal's own buffers;
- malloc 9.5 MB (nano 3.0, small 3.0, tiny 1.7, medium 1.3, metadata 0.5): the framebuffer rows, the glyph atlas, the font tables HarfBuzz reads, the UI tree and the interpreter's arenas; font files themselves are mapped clean (11 MB mapped file, not counted);
- __DATA/__DATA_DIRTY/__AUTH 3.6 MB, CoreUI image data 1.0 MB, ColorSync 0.5 MB, CoreAnimation 0.3 MB: AppKit and the system frameworks, the same in any Cocoa app;
- stack 0.4 MB, page table 0.75 MB.
The earlier breakdowns (docs/reports/engine-memory-cpu-2026-10-31.md, engine-memory-hal-2026-10-31.md) give the same owners; the levers left are the double buffer (ZINC_PRESENT=auto, opt-in) and the upload texture, both in the HAL.

Part 4, lines for docs/reports/zinc-next-perf.md (the coordinator adds them, then ticks #4 and sets Done; all measured on the M1 Pro while another tree built, so the CPU figures are indicative, sizes exact):
- 2026-11-09 ZN-805 idle window: hello (zinc:ui, nothing moving) 0.80% -> 0.17-0.20% of one core; idle loop turns 60/s -> 8.9/s (the 100 ms cap); a due timer fires 6-8 ms late (QuickJS 7.9 ms). Footprint 29-30 MB unchanged; ps RSS 135 MB counts the shared dyld cache.
- 2026-11-09 ZN-805 export size, hello for macOS, permissions []: binary 6,304,720 -> 5,177,184 B; .app 6168 -> 5064 KB; zip 2,899,375 -> 2,370,332 B (Tauri row: 4888 KB, 2069 KB zipped). No Mbed TLS or llhttp; 7 system frameworks no longer loaded.
- 2026-11-09 ZN-805 threads: idle hello 14 threads (7 raster bands); with ZINC_RENDERER=metal 7 (bands start only on a large CPU frame).
Proposed tests: tests/t1/idle_sleep.sh (windowed, ~5 s, ~80 MB: turns per second and timer lateness of an idle window); tests/t1/sbom.sh (the SBOM still lists what a networked export links); tools/resmon on hello for 60 s on a quiet machine (the real idle CPU figure, ~1 min, ~150 MB); tools/window-memory on hello by hand (footprint, ~30 s); bench/vs-electron/measure.sh retake (the size row against Tauri and Electron, a few minutes).
<!-- SECTION:NOTES:END -->
