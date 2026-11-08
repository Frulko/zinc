---
id: ZN-1027
title: A failed native plugin build fails loudly
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
updated_date: '2026-11-08 20:40'
labels:
  - plugins
  - cli
  - size-S
milestone: m-9
dependencies: []
ordinal: 3900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a native plugin fails to compile, auto mode and `zinc pack` fall back to the simulation stand-in with a warning only (a broken canvas2d.host.cpp went unnoticed). Make it an error in `pack`/`export` and a visible banner in `run`, with a test using a deliberately broken plugin.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-774.14: when a native plugin fails to compile, auto mode falls back to the simulation with only a warning (a broken canvas2d.host.cpp went unnoticed until ZINC_NATIVE=real): a test or `zinc doctor` should report it.
- zinc pack: a plugin whose native build fails still falls back to its stand-in with only a warning; auto mode should fail loudly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc pack` and `zinc export` fail with the compiler error when a plugin fails to build
- [x] #2 `zinc run` prints one clear line naming the plugin and `ZINC_NATIVE=sim` to continue
- [x] #3 a test with a broken plugin fixture
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker, 2026-11-08).
- zinc pack and zinc export set ZINC_NATIVE_REQUIRED=1 (setenv without overwrite, inherited by the builds export runs); loadChecked then stops on a stand-in chosen because the native build failed (nativeBuildFailed: a reason that is not 'has no native source'), printing 'zinc: plugin <name> did not build: <the whole compiler error>' and 'set ZINC_NATIVE=sim to ship its simulation instead'. A plugin with no native source for the target, ZINC_NATIVE=sim and deterministic runs are not failures (no build tried).
- zinc run: one warning line 'plugin probe did not build, so it runs its simulation (probe.host.cpp:1:1: error: ...); fix it, or set ZINC_NATIVE=sim to run the simulation without building'.
- Test: tests/t1/plugin_broken.sh (a plugin with a broken probe.host.cpp: run line, pack refused with the compiler error, ZINC_NATIVE=sim packs), mapped in tests/affected.json; passes in 5 s; plugin_fallback still passes. zinc export of the fixture by hand: 'zinc export: the build failed' after the compiler error.
- Decision (for the record): fail loudly by default in pack/export, opt-in fallback through ZINC_NATIVE=sim, as npm/pip/cargo/Flutter do (a failed native build fails the install; a stub only when the package or the user asks: npm optionalDependencies https://docs.npmjs.com/cli/configuring-npm/package-json#optionaldependencies, cargo build scripts https://doc.rust-lang.org/cargo/reference/build-scripts.html). zinc run keeps falling back (a beginner's program still runs) with one visible line.
- Not done here: zinc doctor does not list plugins that fail to build (ZN-774.14 mentions it): later.md line.
Proposed tests: tests/t1/plugin_broken.sh and plugin_fallback on CI; an export of a project with a broken plugin for a Linux target (cross build) on the cross-platform pass.
<!-- SECTION:NOTES:END -->
