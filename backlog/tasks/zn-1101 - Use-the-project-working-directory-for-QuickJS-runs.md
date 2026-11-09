---
id: ZN-1101
title: Use the project working directory for QuickJS runs
status: Done
assignee: []
created_date: '2026-11-09 21:27'
labels:
  - runtime
  - filesystem
  - size-S
milestone: m-32
dependencies: []
ordinal: 1019
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks real Data FileDialog/FileView in ZN-1078.12. Confirmed four-line repro .worktrees/1078-data-proof/.logs/data-proof/fs-cwd/main.ts with fs:read:. permission, manifest and marker.txt. Interpreter cwd is that project and marker=true; QuickJS cwd is worker repository and marker=false. Raw fs-cwd-interp.log and fs-cwd-quickjs.log retained. Binding docs/guide/04-headless-services.md192 says zinc run project starts IN project, launchDir retains caller. main.cpp2713 --engine dispatch returns at2809 before typed path3282 chdir; native exec1813 follows interpreter. Fix once in shared run setup/context with existing RAII/platform helpers, no duplicate engine path adjustment, no application conditional/repository-relative workaround. Normalize entry/assets paths before moving cwd, preserve launchDir and permission resolution; inspect error/restart cleanup and existing engine invocation callers. Primary research: https://nodejs.org/api/process.html#processcwd and https://man7.org/linux/man-pages/man2/chdir.2.html . Sole core worker1100 can take as second task in same warm tree after its proof; main external display12line hunk near3632 must stay unchanged. No suite, only bounded exact T0 and actual feature smoke.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc run project uses the documented project working directory on interpreter, native and QuickJS, retaining launchDir as the original caller directory and preserving single-file invocation rules
- [x] #2 Relative filesystem paths and scoped fs permissions resolve consistently before QuickJS plugin initialization; absolute entry/assets paths remain valid and failures clean up/restore context where the CLI requires it
- [x] #3 Focused T0 proves the same cwd/marker result on all three engines from an external launch directory, plus missing-project/error paths; actual Data FileDialog/FileView and existing checks pass with no engine-conditional path workaround
<!-- AC:END -->

## Implementation notes

Research: Node documents cwd as the process current directory (https://nodejs.org/api/process.html#processcwd); POSIX chdir makes it the base for relative paths and leaves it unchanged on failure (https://man7.org/linux/man-pages/man2/chdir.2.html). Zinc already promises project cwd and caller launchDir in docs/guide/04-headless-services.md. No dependency is needed.

One CLI enterRunDirectory helper now owns that execution setup for native exec, interpreter and JavaScript dispatch. The JavaScript entry becomes absolute first, then the process enters the project before permission/native-plugin initialization. The existing engine root is already absolute. This is the final process execution directory, not a temporary frame context, so no new saved/restored lifecycle or guard class is introduced. A failed chdir reports the error and runs no program; inherited launchDir remains respected. No-manifest single-file runs keep caller cwd. A shared entry-read check also rejects unreadable or nonexistent file arguments before dispatch, including extensionless paths that the typed loader previously treated as empty programs.

Read-only main diff inspected: the other session's display-driver block near3653 is separate and unchanged; none of its runtime/LVGL/array edits were copied.

Proposed milestone checks: existing tests/run --only sys_launch (T1) and broader dev/desktop-launch/error restart paths, a few seconds for the launch fixture; platform launch/permissions behavior on Pi/Mojave/Windows at their selected pass. No broad suite, T1/T2/demo, benchmark or cross-target run here.

Final proof: own tools/build zinc PASS; exact tests/run --only project_cwd PASS across interpreter, native AOT and QuickJS. The fixture drives directory/relative-file entries, no-manifest standalone files, imported sibling modules, relative marker reads, caller launchDir, denied outside-scope reads, empty project and nonexistent extensionless/.ts entries. Missing extensionless paths previously exited0; the shared entry-read validation now rejects them on every engine. Root also reports original public kit_data PASS on combined source8f8478bd5: all12 interpreter/native/QuickJS runs for Solid/React/Metric/Surfaces, including real readonly Open/Save/reopen paths, using this candidate before the independent missing-entry guard. No application path workaround. Logs .logs/1101/{build-final,project_cwd-final}.log and provenance.json. Existing nanosvg signedness warning remains; no new warning from the changed code. No own process or queued command remains. No runtime speed/memory or broader-platform claim.
