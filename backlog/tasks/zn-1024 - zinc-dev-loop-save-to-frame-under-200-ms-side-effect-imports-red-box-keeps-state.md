---
id: ZN-1024
title: >-
  zinc dev loop: save-to-frame under 200 ms, side-effect imports, red box keeps
  state
status: Backlog
assignee: []
created_date: '2026-11-07 16:36'
labels:
  - dev
  - perf
  - size-M
milestone: m-20
dependencies: []
ordinal: 7400
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compile a save on a thread while frames continue (they pause 100-450 ms), a parse cache for unchanged files, side-effect-only imports in the importer graph, `import.meta.hot` blocks type-checked, and a red box drawn over the paused program so a typo keeps the state.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-742: a parse cache for unchanged files and compiling on a thread, to bring a save under 200 ms.
- ZN-742: `if (import.meta.hot)` blocks are not type-checked by `zinc check` or the LSP (removed before checking outside hot mode); check them in hot mode too, or warn.
- ZN-742.02: compile a save on a thread while frames continue (frames pause 100-450 ms during the in-process compile today).
- ZN-742.02: side-effect-only imports (`import './x'`) are not in the importer graph, so editing such a module does not re-run its importer.
- ZN-742: the in-process red box: keep the paused program and draw the diagnostics over its window, so a typo does not lose the state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a save in `zinc dev` of hero shows the new frame in under 200 ms (measured, logged)
- [ ] #2 editing `import "./x"` re-runs its importer
- [ ] #3 a type error draws the diagnostics over the window and the state survives the fix
<!-- AC:END -->
