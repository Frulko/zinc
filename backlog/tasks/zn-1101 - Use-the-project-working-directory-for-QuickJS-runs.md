---
id: ZN-1101
title: Use the project working directory for QuickJS runs
status: Backlog
assignee:
  - '@parallel'
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
- [ ] #1 zinc run project uses the documented project working directory on interpreter, native and QuickJS, retaining launchDir as the original caller directory and preserving single-file invocation rules
- [ ] #2 Relative filesystem paths and scoped fs permissions resolve consistently before QuickJS plugin initialization; absolute entry/assets paths remain valid and failures clean up/restore context where the CLI requires it
- [ ] #3 Focused T0 proves the same cwd/marker result on all three engines from an external launch directory, plus missing-project/error paths; actual Data FileDialog/FileView and existing checks pass with no engine-conditional path workaround
<!-- AC:END -->
