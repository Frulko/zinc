---
id: ZN-713
title: >-
  Numbers against Electron and Tauri: size, start time, memory of the same small
  app
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 16:08'
updated_date: '2026-10-11 18:45'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the same small app (a window, a list, a text field, an image) exists for Zinc, Electron and Tauri in a bench directory, with the script that builds and measures them
- [ ] #2 size on disk of the shipped app, time from launch to first frame and resident memory after 10 s are measured on the development Mac, alone on the machine, five runs each, and logged in docs/reports/zinc-next-perf.md
- [x] #3 where Zinc is not clearly ahead, the cause is named and given as lines for next/backlog/later.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Handover (2026-10-11, parallel agent)

Done: `next/bench/vs-electron/` holds the app three times (`zinc/` with zinc:ui/nuxt, `electron/` 44.7.0 packaged with @electron/packager and asar, `tauri/` 2.12 release bundle with the size profile of Tauri's guide) and `measure.sh [build] [measure]` (`ZINC=`, `RUNS=`, `APPS=`). Rust is in `~/.zinc/bench-tools/` (rustup with RUSTUP_HOME and CARGO_HOME there, `--no-modify-path`); the Tauri build took 4 min 49 s.

How it measures (header of measure.sh): installed = `du -sk` of the .app, download = the .app zipped with ditto (same container for the three); start = `open -n` to the `first-frame` line (each app prints it at the start of its second frame); memory = sum of `ps` RSS at 10 s of the main process, its descendants and the processes it is responsible for (Tauri's WebKit XPC services are children of launchd; `open` makes the app their responsible process, a direct exec from a terminal does not). A sum of RSS counts shared pages once per process, which is against Electron and Tauri. `next/tools/resmon` was read and not used: it samples one pid, not a process family.

Numbers, Intel Mac, 2026-10-11 20:37 to 20:45, TAKEN UNDER LOAD, TO RETAKE ALONE (other trees were building; CPU speed limit 40 to 66 of 100):

| app | download (zip) | installed | start, pass 1 (median, range) | start, pass 2 | memory at 10 s, pass 1 | memory, pass 2 | processes |
|---|---|---|---|---|---|---|---|
| Zinc (export --target macos) | 2379 KB | 5484 KB | 463 ms (439-595) | 585 ms (486-618) | 83.4 MB (82.0-85.0) | 83.2 MB (80.9-84.7) | 1 |
| Electron 44.7.0 | 130838 KB | 300248 KB | 657 ms (615-719) | 740 ms (738-903) | 212.6 MB (212.5-212.8) | 213.8 MB (213.7-213.9) | 4 |
| Tauri 2.12 | 2069 KB | 4888 KB | 1050 ms (668-37534) | 865 ms (725-914) | 104.3 MB (102.0-107.9) | 106.8 MB (105.5-107.8) | 4 |

Machine state per run, pass 1 (load average 1 min, speed limit): Zinc 7.4/51, 6.8/55, 6.4/62, 5.9/66, 5.5/64; Electron 5.9/57, 5.4/57, 5.4/62, 5.1/64, 4.7/66; Tauri 4.5/64, 4.6/62, 4.9/55, 5.8/44, 6.4/40. Pass 2: per-run state not kept (my filter dropped the lines); 6.8/51 just after it.
Tauri pass 1 runs: 668, 688, 1050, 37534, 1083 ms. The 37.5 s run is not explained: the likely cause is that the window was hidden or covered at that moment (WebKit holds requestAnimationFrame of a window that is not visible), not checked. An earlier single Electron launch showed 6 processes and 307.9 MB; the ten later ones 4 processes and about 213 MB.
The sizes are valid. The times and the memory are not the task's numbers: criterion 2 asks for a machine alone.

Where Zinc is not clearly ahead (read from the exported binary and one `vmmap -summary` of the running app):
- Size: Tauri is smaller (4888 KB against 5484 KB installed, 2069 against 2379 KB zipped) because its web engine is the system's. The Zinc bundle is one stripped 5.58 MB executable (`__text` 4.26 MB, `__const` 0.77 MB). Its SBOM lists Mbed TLS, libuv, llhttp, libwebp, QuickJS's libunicode and libregexp and all of SDL3 for an app with `"permissions": []`; it links CoreBluetooth, GameController, CoreHaptics, ForceFeedback, CoreMotion, AVFoundation, AudioToolbox and OpenGL.
- Memory: 83 MB RSS against Tauri's 104 MB summed over 4 processes is a lead of 20%, not a clear one. Physical footprint 65.3 MB: 23.3 MB IOKit and 9.9 MB IOAccelerator (the GPU context; the process has OpenGL GLSL regions), about 25 MB of dirty malloc heap (LARGE 8.4, MEDIUM 8.1, SMALL 4.3, NANO 2.7, TINY 1.4) for a list of 200 text rows, 14 threads.
- Start: about 0.5 s under load against 0.65 to 0.75 s for Electron: not a clear lead until retaken alone; what the 0.5 s is made of was not profiled.

Lines for `next/backlog/later.md` (the coordinator adds them):
- ZN-713: a UI-only export links Mbed TLS, libuv, llhttp, libwebp and every SDL3 subsystem (gamepad, haptics, Bluetooth, sensors, audio, camera): link them only when the program or its permissions use them; the 5.5 MB .app is larger than Tauri's 4.9 MB.
- ZN-713: 33 MB of the 65 MB footprint of a list app is the GPU context (IOKit 23.3 MB, IOAccelerator 9.9 MB, OpenGL on the Intel Mac): measure the Metal path and a CPU-raster window for a UI-only app.
- ZN-713: 25 MB of malloc heap for 200 text rows, one field and one image: find what holds it (glyph atlas, baked fonts, node tree, mimalloc arenas) with a heap profile.
- ZN-713: 14 threads in a one-window list app: name each one and start the ones a program does not use lazily.
- ZN-713: profile launch to first frame of the exported app (about 0.5 s under load): what happens before the window opens.
- ZN-713: measure.sh could add the physical footprint (what Activity Monitor shows) beside the RSS sum, which counts shared pages once per process.

Next command, on a quiet machine (no other tree building, `pmset -g therm` at 100), from `next/bench/vs-electron`: `./measure.sh build measure` (or `./measure.sh measure` while the bundles are still there), then log the table in `docs/reports/zinc-next-perf.md` and tick criterion 2.
<!-- SECTION:NOTES:END -->
