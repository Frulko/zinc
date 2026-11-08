---
id: ZN-1027
title: A failed native plugin build fails loudly
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
labels:
  - plugins
  - cli
  - size-S
milestone: m-9
dependencies: []
ordinal: 3900
updated_date: '2026-11-07 18:30'
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
- [ ] #1 `zinc pack` and `zinc export` fail with the compiler error when a plugin fails to build
- [ ] #2 `zinc run` prints one clear line naming the plugin and `ZINC_NATIVE=sim` to continue
- [ ] #3 a test with a broken plugin fixture
<!-- AC:END -->
