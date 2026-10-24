---
id: ZN-802
title: First-run polish of the CLI messages and guide (ZN-711 follow-ups)
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-M
milestone: m-6
dependencies: []
ordinal: 3900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-711: type errors say `'f64'` where the user wrote `number`.
- ZN-711: one misspelt import adds a "Cannot find name" per use (5 errors for one typo), with no did-you-mean from the names in scope.
- ZN-711: a bare specifier (`import x from 'confetti'`) answers with tsconfig paths, without saying npm packages are not loaded.
- ZN-711: `zinc explain Z0119` only speaks of relative files; `zinc dev` prints a compile error without the closing what-to-do line.
- ZN-711: `zinc new` with no argument makes a game in the current directory and answers "next: cd . && zinc run".
- ZN-711: the desktop-app template run headless prints two multi-kilobyte `[system]` lines; the server template binds port 3000 with no `PORT` variable.
- ZN-711: guide 01's reference sections and `docs/guide/README.md` still describe the prototype (Docker, Node sim, pnpm); `zinc help env` no longer exists.
- ZN-711: `tests/t0/plugin_manifest` fails on main ("zinc plugins differs from the prototype's table").
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A type error names the type as the user wrote it (number, not f64)
- [ ] #2 One misspelt import gives one error with a did-you-mean; a bare npm specifier says npm packages are not loaded
- [ ] #3 `zinc new` with no argument asks or explains instead of building in the current directory; desktop-app template headless output is short; server template reads PORT
- [ ] #4 docs/guide/README.md and 01 describe the engine (no Docker, Node sim); tests/t0/plugin_manifest passes
<!-- AC:END -->
