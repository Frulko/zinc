---
id: ZN-687
title: 'zinc:sys: the directory a program was launched from and the system locale'
status: Done
assignee: []
created_date: '2026-10-10 19:42'
updated_date: '2026-10-10 21:03'
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
- [x] #1 `sys.launchDir()` gives the directory the user ran the command from, on zinc run and in a built program (test)
- [x] #2 `sys.locale()` gives the system's preferred language on macOS, also for an app started from the Finder; the environment overrides it (test)
- [x] #3 docs updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: zinc:sys launchDir() and locale() (rows host.sysLaunchDir / host.sysLocale appended, isSysTailRow so QuickJS installs them too; lib/modules.d.ts, sim/sys.mjs). zinc run sets ZINC_LAUNCH_DIR to the user's directory before entering the project (interpreter and the compiled exec); a program without it answers the directory it started in (kept before its first chdir). locale: LC_ALL, LC_MESSAGES, LANG (not C/POSIX) as BCP 47, else on macOS the first of CFLocaleCopyPreferredLanguages (CoreFoundation opened on demand: programs still do not link it), else en-US. Test tests/t1/sys_launch.sh: from another directory interp and native give launch = that directory and cwd = the project; a built program started elsewhere gives that directory; LC_ALL=de_DE.UTF-8 -> de-DE, LANG=pt_BR.UTF-8 -> pt-BR, no variable -> AppleLanguages' first (fr-FR here). QuickJS checked by hand. Doc: docs/guide/04-headless-services.md. Linux: the env path only (no system query), as documented. usage: n/a
<!-- SECTION:NOTES:END -->
