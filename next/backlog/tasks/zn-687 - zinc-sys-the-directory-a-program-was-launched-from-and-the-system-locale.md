---
id: ZN-687
title: 'zinc:sys: the directory a program was launched from and the system locale'
status: Backlog
assignee: []
created_date: '2026-10-10 19:42'
labels:
  - sys
  - size-S
milestone: m-27
dependencies: []
ordinal: 448410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum editor: `zinc run <dir>` starts the program in the project directory, so a relative path given as an argument cannot be resolved (the editor reads the shell's PWD), and a program has no way to ask the system language (it reads LC_ALL / LANG, which an app started from the Finder does not have).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `sys.launchDir()` gives the directory the user ran the command from, on zinc run and in a built program (test)
- [ ] #2 `sys.locale()` gives the system's preferred language on macOS, also for an app started from the Finder; the environment overrides it (test)
- [ ] #3 docs updated
<!-- AC:END -->
