---
id: ZN-720
title: Show run progress on every engine and explain native fallbacks
status: Done
assignee: []
created_date: '2026-10-12 08:46'
updated_date: '2026-10-12 09:05'
labels:
  - cli
  - size-M
milestone: m-13
dependencies: []
ordinal: 485410
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 QuickJS and typed run/build print their engine and stages by default; explicit quiet flags and JSON remain usable
- [x] #2 Long native builds show live elapsed time and completed units, including cached objects and linking
- [x] #3 Automatic native-plugin failures report the module, simulation fallback and cause on fresh and cached launches
- [x] #4 Targeted regression tests cover QuickJS logs, quiet/JSON output, native build progress and plugin fallback cache replay
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner request: explain silent JS launches, show useful information at every run/build, report unavailable plugins, and show progress during long museum native builds. Implemented default stderr stages for typed/QuickJS paths, explicit engine and cache invalidation reasons, C++ object reuse counts, a polling command runner with elapsed-time spinner in terminals and periodic lines in pipes, and announcements before resource/AOT/plugin operations. Native fallback notices survive ZBC and AOT caches; forced simulation is informational, failed native code warns with the cause. -q/ZINC_STEPS=0 hide progress; JSON remains structured; tests explicitly opt out of normal progress. QuickJS now honors dev.perfHud. PASS: build_progress, steps, plugin_fallback, verbose_log, run_js_engine, modules, run_cache, run_compiled, perf_hud, webview. Real headless p5 HUD and Phaser startup smoke passed; a terminal native build showed live spinner frames. Museum native run passed: 43 files/618 functions, 14 cached C++ units, 93.65 MB binary. Payload/timings recorded in zinc-next-perf.md; this was not a cold-build benchmark. No cross-platform runs. Known limit: diagnostics describe selected backend and failures, not arbitrary bugs inside successfully loaded plugin code. usage: n/a (Codex; tools/usage reads an unrelated Claude transcript).
<!-- SECTION:NOTES:END -->
