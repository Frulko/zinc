---
id: ZN-750
title: 'Android CPU cores: measure, keep them online while animating, tablet tuning'
status: Backlog
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
- [ ] #1 a table of fling and swipe frame times (p50, p99, late frames) with 1, 2 and 4 cores, and the cores and clocks seen in a normal run, in the task notes and docs/reports/zinc-next-android.md
- [ ] #2 setSustainedPerformanceMode requested while animating on Android (logcat line, isSupported answer on the Nexus 7 recorded), released when idle or paused
- [ ] #3 nexus7-tune.sh apply/revert/status handles the min-cores setting; numbers before and after
<!-- AC:END -->
