---
id: ZN-710
title: zinc run and zinc build print the plugins the program uses
status: Backlog
assignee: []
created_date: '2026-10-11 07:30'
labels:
  - cli
  - size-S
milestone: m-13
dependencies: []
ordinal: 26500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-11): at the start of a run or a build, see which plugins the program calls, as the prototype does.

The prototype prints one line on stderr, `zinc: plugins: a, b`, from the plugins the sources really import, and nothing under `--json` (`compiler/src/cli.ts:445` and its `log` at line 712, `activePlugins` in `compiler/src/plugins.ts`). Zinc Next resolves the same set (`gPluginDirs` in `next/src/main.cpp`, the plugin discovery of `zn::frontend`) and builds or loads each plugin, but prints nothing unless one fails.

Print the line for `run` (interpreter, compiled, `--engine quickjs`), `build` and `dev`. Not the plugins that are installed: the ones this program imports, display drivers included.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc run and zinc build of a project that imports plugins print one line naming them (the prototype's wording, read from its log function), before the program starts or the build ends; a program that imports none prints nothing
- [ ] #2 the line goes where the prototype's log goes and is silenced the same way (quiet and JSON output); the frozen outputs of the corpus and the existing goldens do not change
- [ ] #3 the same line under --interp, the compiled run and --engine quickjs, and in zinc dev after a reload that adds or removes a plugin import
- [ ] #4 a T0 test: a project importing two plugins shows both names in order, a project importing none shows no line
<!-- AC:END -->
