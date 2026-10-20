---
id: ZN-711
title: >-
  First five minutes: install, zinc new, run and a first error, walked as a
  beginner
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-11 11:38'
updated_date: '2026-10-11 14:28'
labels:
  - cli
  - docs
  - size-M
milestone: m-13
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-11): Zinc is for education, makers, artists and DIY, and nobody outside the project has walked its first run. Walk it as a newcomer on the development Mac: install, `zinc doctor`, `zinc new` with each template, `zinc run`, a first change, a first mistake, `zinc dev`. Fix on the way what takes less than an hour; the rest is lines for `next/backlog/later.md`.

Second lane of the parallel agents, after the pinball and the museum (owner's order, `next/backlog/priority.json`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a scripted test creates a project from every template of templates/ in an empty directory, runs it headless for a few frames and passes; a template that fails is fixed
- [x] #2 six beginner mistakes (a misspelt import, a type error, an unknown zinc: module, a plugin that is not installed, a JSX tag left open, a missing file) each print the file, the line and what to do next; the messages are goldens
- [x] #3 docs/guide/01-getting-started.md follows the tested path command for command, from the install to a changed line seen on screen, and says what a teacher, a maker and an artist can open next
- [x] #4 what the walk found and did not fix is given as lines for next/backlog/later.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Walked on the development Mac with the main binary, then a worktree build (2026-10-11).

Test: next/tests/t1/first_run.sh (17 s): the 13 templates created in an empty directory and run headless 3 frames (servers: listening until the timeout), a changed text changes the frame hash, seven goldens in next/tests/golden/first-run/ for the six mistakes (the misspelt import has two: a name, a path), the guide quotes each message, bare zinc / --help / a misspelt command. PASS first_run, checker, diagnostics, rejections, cli_core, cli_tools, modules, jsx, jsx_style, react_class, parser, templates, run, project, dev_mode, tdz, security_guide, ci_plan. plugin_manifest fails on main's binary too (zinc plugins differs from the prototype's table): not from this task.

Every template ran as it was: none needed a fix.

Fixed in the engine:
- zinc run / build / check end their diagnostics with one line: the count, the registry's fix of the first error and zinc explain <code> (frontend::hint; not for check --check|--types|--json nor the stage commands, whose output tools read line by line).
- did you mean: an import of a name the module does not export, a relative import (the closest .ts/.tsx beside it, and the file that was looked for), a zinc: module (closest module or plugin), a missing entry file (was Z0001 Unexpected token: cannot read; now Z0119 with the closest file), a misspelt command (frontend::nearest, Levenshtein).
- an unknown zinc: module with nothing close says zinc plugins, zinc plugins search <name>, zinc add <name>.
- JSX: a closing tag was never compared with its opening tag (<text>..</txt> compiled; a missing </text> was reported at the end of the file as Z0005 Syntax not supported yet: unexpected token in JSX children). Now Z0002 at the tag left open, with the line of the wrong closing tag and the tag to add.
- a bare zinc printed the usage of the lexer stage, zinc --help said no help for '--help', an unknown command printed the same stage usage: now the command list, and the usage of a known command whose arguments fit nothing.

Not proven here: no window was opened (parallel worktree): the windowed first run and the red box of zinc dev were run headless only; the install is the build of this worktree (cmake + tools/build), not a clone on a clean machine.

Lines for next/backlog/later.md (First five minutes):
- ZN-711: no installer or release download: the first step is a 6 to 8 minute build with CMake and a C++20 compiler, the highest wall for a teacher or an artist.
- ZN-711: type messages say 'f64' where the user wrote number (Type is not assignable: 'string' to 'f64'); print the name the user wrote.
- ZN-711: one misspelt import gives one more Cannot find name per use (5 errors for one typo), and Cannot find name has no did-you-mean from the names in scope.
- ZN-711: a bare specifier (import x from 'confetti') answers no tsconfig.json paths entry maps it: say that npm packages are not loaded and name zinc plugins search.
- ZN-711: zinc explain Z0119 only speaks of relative files; the code now also covers zinc: modules, plugins and a missing entry.
- ZN-711: zinc dev prints a compile error without the closing what-to-do line of zinc run.
- ZN-711: zinc new with no argument makes a game in the current directory and answers next: cd . && zinc run; ask for a name instead.
- ZN-711: the desktop-app template run headless prints two [system] menu.setApp / tray.create lines of several kilobytes on stdout.
- ZN-711: the server template binds port 3000 with no PORT variable (service has one); the message when the port is taken was not looked at.
- ZN-711: docs/guide/01 reference sections (Targets and profiles, Editor setup, zinc init) and docs/guide/README.md still describe the prototype (Docker, the Node sim, pnpm); zinc help env no longer exists.
- ZN-711: tests/t0/plugin_manifest fails on main (zinc plugins differs from the prototype's table).
<!-- SECTION:NOTES:END -->
