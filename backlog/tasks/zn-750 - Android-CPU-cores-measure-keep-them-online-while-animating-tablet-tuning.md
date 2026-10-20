---
id: ZN-750
title: 'Android CPU cores: measure, keep them online while animating, tablet tuning'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-16 21:50'
labels:
  - mobile
  - perf
  - size-M
milestone: m-26
dependencies: []
ordinal: 196350
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16: on the Nexus 7 (Tegra 3, autosmp hotplug min_cpus 1, intelliactive governor) a running Zinc app mostly has ONE core online (sampled every 0.5 s: 0, sometimes 0-1; 513-1300 MHz), while the software raster splits a frame into bands for 4 threads (D126 measured the raster on four A9 cores). Three things: (1) measure rn-showcase's scripted fling and the music carousel swipe with 1, 2 and 4 cores held online (root, before the run, never during: a Magisk su during a run spoils presents) and the cores and frequency seen during a normal run; (2) the engine asks the system for steady clocks while it animates, for every Android app: Window.setSustainedPerformanceMode where PowerManager.isSustainedPerformanceModeSupported (API 24+), else nothing; zinc:webos setPerformance and a zinc:sys device query map to it (D122 answered false off webOS); and the raster's worker threads stay ready while frames keep coming so the scheduler does not fold them on one core (measure that it helps, not by belief); (3) docs/reports/hardware/nexus7-tune.sh gains a reversible min-cores setting for this dev tablet (apply/revert/status), chosen from the numbers of (1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a table of fling and swipe frame times (p50, p99, late frames) with 1, 2 and 4 cores, and the cores and clocks seen in a normal run, in the task notes and docs/reports/zinc-next-android.md
- [x] #2 setSustainedPerformanceMode requested while animating on Android (logcat line, isSupported answer on the Nexus 7 recorded), released when idle or paused
- [x] #3 nexus7-tune.sh apply/revert/status handles the min-cores setting; numbers before and after
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17, worktree agent. Measured on the Nexus 7 (adb 015d2ebe8c081c06), debug APKs of this tree, scripts in /tmp/zn750 (run.sh, hold.sh, series*.sh).

Finding: the hotplug is Tegra's cpuquiet with the `balanced` governor; autosmp is compiled in but off (/sys/module/autosmp/parameters/enabled = N), so its min_cpus/max_cpus do nothing. balanced brings cores up from the average count of runnable threads above idle_top_freq. init.grouper.rc sets 60 ms delays and a 102 MHz floor; setting any cpuquiet governor puts the kernel defaults back (up 1 s, down 2 s, 513 MHz floor), the state the tablet was in on 2026-10-16. Any app launch onlines all four cores for ~1.5 s (system boost), so cores are held with PM QoS (/dev/min_online_cpus, max_online_cpus held open by a root shell), set 8 s before a run, no root during it.

AC1, rn-showcase ten flings (late frames of 720 moving, interval p50/p99, raster p50) and music six carousel swipes (late of 390):
- 1 core held: 474, 22.2/38.3 ms, raster 15.3 ms; swipes 327 (interval p50 106 ms)
- 2 held (max 2): 443, 18.8/41.0, 10.2; swipes 203
- at least 2: 318, 397; at least 3: 352
- 4 held: 240, 270, 295, 297, 16.7-16.8/30-36, 7.3-8.4; swipes 184, 185, 189
- ROM balanced (a normal run): 303, 305, 321, 335, 338, 362, 365, 366, 16.9-17.6/28-35, 8.0-9.2; swipes 175, 184, 189, 199; cores seen 2: 22-32%, 3: 22-45%, 4: 30-52%; cpu0 p50 860-1000 MHz (513-1300)
- kernel defaults after a governor switch: 314, 349, 453 (the 453 run: 1 core 22%, 2 cores 60%)
Table also in docs/reports/zinc-next-android.md "CPU cores (ZN-750)".

AC2: hal_sdl.cpp steady_clocks() sends ZN_APP_ANDROID_SUSTAINED (SDL_SendAndroidMessage 0x8002) on the first frame with damage and 1 s after the last; ZincActivity sets Window.setSustainedPerformanceMode(moving || program) where PowerManager.isSustainedPerformanceModeSupported(), drops it in onPause, re-applies in onResume. zinc:webos setPerformance -> device('performance') -> mobileCommand -> the activity (answers "0" where unsupported; iOS answers "0"). Nexus 7: `I zinc: sustained performance mode supported: false`, then `D zinc: sustained performance mode on (not supported here: nothing asked)` at each fling and `off` a second after it, and off on Home. Same answer on the API 37 emulator.
Worker threads kept runnable (spin with sched_yield 30 ms after a band, ZINC_RENDER_SPIN): 4 cores online 75-85%, clock p50 1300, raster p50 5.8-6.2 ms (from 8.0-9.2) but late frames 365-427 against 314-366 alternated, interval p50 17.5-18.4 vs 17.0-17.6: the spinning threads take the main thread's time. Dropped, not committed.

AC3: nexus7-tune.sh apply keeps four cores online (cpuquiet userspace + cpu1-3 online, now and in its boot rc), revert puts balanced back with init.grouper.rc's values, status prints cores online and the governor. Before apply: flings 321, 365 late (p99 29.7, 33.7 ms); after: 281, 302, 255 (p99 31.6, 30.6, 30.3; raster p99 13.9 from 15.3-18.9); swipes 184 before, 184 and 184 after. Applied on the tablet (status: cores online 0-3, cpuquiet userspace).

Coordinator's addition (same code path): the zero-copy present asked for HAL format 5 (BGRA_8888); the API 37 arm64 emulator (Pixel_10) accepts it, reports 5 from ANativeWindow_getFormat and the lock, and composes it as RGBA (hero orange drawn (42,73,232)). No query detects it, so from API 26 the window asks for RGBX_8888 and each band stripe is drawn into the thread's cached rows then written swapped (band_swap); below API 26 BGRA in place (the swap costs the Nexus 7 5 ms of raster a scrolled frame: p50 13.2 vs 8.3 ms, 433-474 vs 324-380 late, three runs each). ZINC_PRESENT_BGRA=1/0 forces. Emulator after: (232,73,42), 0 stale pixels in 60 posts of six drags (ZINC_PRESENT_VERIFY=1); Nexus 7 RGBX path 0 stale in 300 posts; Nexus 7 screencap at rest identical to before (0 differing pixels below the status bar).

Decision text (for the coordinator, no number taken): "Android CPU cores and steady clocks (ZN-750): the engine asks Window.setSustainedPerformanceMode while frames move and while a program asks for full speed (zinc:webos setPerformance), where PowerManager says the device has it; nothing else (no thread spinning, no hotplug writes: an app cannot, and keeping workers runnable lost frames). The development Nexus 7 keeps its four cores online through nexus7-tune.sh (cpuquiet userspace): 255-302 late frames of 720 in a fling against 303-366 with the ROM's balanced governor. Window buffer: RGBX_8888 with a per-stripe red/blue swap from API 26, BGRA_8888 drawn in place below (format 5 is not an NDK format and the API 37 emulator composes it as RGBA without saying so). Revisit: a device of API 26-36 measured honouring BGRA (move the line), a raster that writes RGBA itself (no swap), and a device that answers true to isSustainedPerformanceModeSupported (measure it)."

later.md lines (for the coordinator):
- ZN-750: the raster could write RGBA itself (an output-order flag in zrt_raster) instead of the per-stripe swap from API 26, which costs a write pass (5 ms a scrolled frame on a Nexus 7); matters for modest API 26+ phones.
- ZN-750: measure the sustained performance mode on a device that supports it (Pixel 1-3 era) and whether it helps a fling; the Nexus 7 and the API 37 emulator answer false.
- ZN-750 (cross-platform pass): check BGRA_8888 vs RGBX on a real API 26-36 device and move the API line if it honours format 5.
<!-- SECTION:NOTES:END -->
