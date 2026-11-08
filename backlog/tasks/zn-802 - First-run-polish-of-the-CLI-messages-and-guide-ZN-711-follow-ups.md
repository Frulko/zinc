---
id: ZN-802
title: First-run polish of the CLI messages and guide (ZN-711 follow-ups)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:55'
updated_date: '2026-11-08 19:24'
labels:
  - size-M
milestone: m-6
dependencies: []
ordinal: 2100
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
- [x] #1 A type error names the type as the user wrote it (number, not f64)
- [x] #2 One misspelt import gives one error with a did-you-mean; a bare npm specifier says npm packages are not loaded
- [x] #3 `zinc new` with no argument asks or explains instead of building in the current directory; desktop-app template headless output is short; server template reads PORT
- [x] #4 docs/guide/README.md and 01 describe the engine (no Docker, Node sim); tests/t0/plugin_manifest passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-08 (worktree agent): walked every line on the current engine.
Already done before this task (checked, nothing to change): type errors name number/string/Map<string, number> as written (no f64); a misspelt import gives one Z0101 with did-you-mean (zinc: modules, relative files, namespace imports); a misspelt path gives one Z0119 with did-you-mean; zinc new with no argument makes my-game with 'cd my-game' next steps; the desktop-app template headless prints no [system] lines; the server template reads PORT (templates/server/src/main.ts); docs/guide/README.md and 01 no longer mention Docker, the Node sim or zinc help env; tests/t0/plugin_manifest passes.
Changed: diag.detail.npm now says the typed engines do not load npm packages (and how to run one: zinc add npm:<pkg>, --engine quickjs), 5 languages; Z0119 why (header, 5 languages, docs/diagnostics.md regenerated) covers relative files, zinc: modules, tsconfig paths and npm; zinc dev after a save with a compile error prints the closing line (count, fix, zinc explain <code>) and names the file relative to the project (it printed the absolute path).
Web search: tsc TS2552 'Cannot find name X. Did you mean Y?' (suggest in-scope names only); Deno refuses bare specifiers and names npm:/jsr:/node: and the import map (docs.deno.com/runtime/fundamentals/node/); clig.dev/#errors (say the fix last).
Tests run: cli_polish (new npm check), diagnostics, explain_fixes, i18n, zinc_i18n, plugin_manifest: all pass.
Proposed tests: tests/t1/dev_mode.sh: after a bad save, expect the 'zinc: 1 error.' closing line under 'zinc dev: compile error' (~30 s, headless).
later.md line: '- ZN-802: number | undefined prints as null | number in Z0103 (undefined and null are one type); print the spelling the declaration used.'
<!-- SECTION:NOTES:END -->
