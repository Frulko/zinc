---
id: ZN-742
title: 'zinc dev: Fast Refresh, swap changed modules in the running VM'
status: Backlog
assignee: []
created_date: '2026-10-16 13:26'
labels:
  - dev
  - cli
  - size-L
milestone: m-20
dependencies: []
ordinal: 64800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-16): an equivalent of React Native Fast Refresh in zinc dev. Today every save kills the process and starts a new one (ZN-141): the window is recreated and all state is lost (current page, inputs, signals); only assets are swapped live (D97). Wanted: on a save, recompile the changed modules only and swap them into the running program (same process, same window, DevTools stays attached). A module that exports only components is re-evaluated and its components re-render while the signals and state of the modules that did not change are kept; a change to a module that exports other values re-evaluates it and its importers (RN rule); a module that cannot be swapped (top-level side effects that cannot be undone, native plugin change, host change) falls back to the full restart of today, with one line saying why. The HMR machinery (module registry hooks, component proxies, the dev channel) is injected only by zinc dev, or on explicit request: zinc run and zinc build/export/pack carry none of it (no code, no symbol, no cost). Reference: React Native Fast Refresh and react-refresh, Vite HMR (import.meta.hot accept/dispose), Solid's solid-refresh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Editing a component file (examples: templates/desktop-app src/pages/home.tsx) under zinc dev updates the window without a restart: the process id and the window stay, the signals of src/state.ts keep their values (current page, typed name), measured by a scripted T1 test (ZINC_INPUT drives the app to a non-default state, the test edits the file, the next frames show the new text and the old state)
- [ ] #2 Editing a module that exports non-component values re-evaluates it and its importers; an edit that cannot be swapped (native plugin, host change, a module with a top-level effect it cannot dispose) falls back to a full restart with a one-line reason; a compile error keeps the red box behaviour
- [ ] #3 Module-level dispose/accept hooks in the spirit of import.meta.hot are available to programs and used by zinc:ui/solid to tear down and re-render the swapped components
- [ ] #4 Nothing of the HMR machinery is in a program run by zinc run or built by zinc build, export or pack unless asked: checked by a T0 test (no HMR symbol or module in the built output, bytecode of zinc run unchanged)
- [ ] #5 Works on the interpreter; --engine quickjs and AOT behaviour stated (swap or documented fallback to restart); docs/dev-mode.md and the zinc dev help updated; save-to-frame time measured and logged in docs/reports/zinc-next-perf.md
<!-- AC:END -->
