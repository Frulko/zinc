---
id: ZN-710
title: zinc run and zinc build print the plugins the program uses
status: Done
assignee: []
created_date: '2026-10-11 07:30'
updated_date: '2026-10-11 07:51'
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
- [x] #1 zinc run and zinc build of a project that imports plugins print one line naming them (the prototype's wording, read from its log function), before the program starts or the build ends; a program that imports none prints nothing
- [x] #2 the line goes where the prototype's log goes and is silenced the same way (quiet and JSON output); the frozen outputs of the corpus and the existing goldens do not change
- [x] #3 the same line under --interp, the compiled run and --engine quickjs, and in zinc dev after a reload that adds or removes a plugin import
- [x] #4 a T0 test: a project importing two plugins shows both names in order, a project importing none shows no line
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11). src/main.cpp: after the load, the plugins whose files the loader read (in the order of plugin discovery, as the prototype's activePlugins filters discover()), then the display driver when one is loaded; printPlugins writes the prototype's line `zinc: plugins: a, b` on stderr once, before the run step (interpreter, compiled run, --engine quickjs) or at the start of the native build (zinc build). Cached programs keep the names in a `plugins` file beside them (zbc cache and run cache), so a run that does not compile prints the same line. Where it goes: like the build steps (zn::log::steps(): a terminal, ZINC_STEPS=1 elsewhere; -q, ZINC_STEPS=0 and ZINC_LOG_FORMAT=json hide it). This differs from the prototype, which printed it unless --json even into a pipe: Zinc Next runs the program in the same process, so a piped line would land in every golden that captures 2>&1 of a plugin program (AC2); the prototype's line never reached a program's output since it ran a built binary. zinc dev restarts `zinc run` on each save, so each version prints its own line. AC1/AC4: tests/t0/plugins_line.sh (tests/data/plugins_line imports zinc:gestures and zinc:ink: the line under the interpreter, from the cached program and under QuickJS; none for a program without plugins, under -q, with JSON logs, or into a pipe); zinc build and the compiled run checked by hand (same line). AC3: tests/t1/dev_mode.sh, the edit that makes v2 adds import zinc:gestures (v2 prints it), the fix that makes v3 drops it (v3 does not). Tests: plugins_line, dev_mode, run_cache, steps, zbc_cache, cli_core pass. Not proven: the display driver in the line (loaded only in a window or with ZINC_DISPLAY). usage: n/a
<!-- SECTION:NOTES:END -->
