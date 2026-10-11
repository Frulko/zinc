---
id: ZN-718
title: >-
  Nothing to compile for a beginner: a prebuilt engine to download, prebuilt
  plugins for every platform
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 16:10'
labels:
  - packaging
  - size-L
milestone: m-19
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 one command or one archive installs a self-contained zinc on macOS with no compiler, CMake or Xcode on the machine; zinc new, run and dev work from it (proved in a directory with a PATH that holds no compiler)
- [ ] #2 a program that imports plugins runs from that install without building them: each plugin is fetched prebuilt for the host from the signed index, and zinc doctor says which plugins have no prebuilt for which platform
- [ ] #3 the release job builds the engine archive and the plugin prebuilts for macOS, Linux and Windows targets with the pinned zig; publishing is the owner's step and its exact command is in the task notes
- [ ] #4 docs/guide/01-getting-started.md starts with the download, not with a source build
<!-- AC:END -->
