---
id: ZN-1044
title: 'zinc doctor, zinc update and plugin install polish'
status: Backlog
assignee: []
created_date: '2026-11-07 16:39'
labels:
  - cli
  - size-S
milestone: m-19
dependencies: []
ordinal: 1036000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First-run and update paths are noisy or incomplete.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-718: a project that sets a plugin's options misses the prebuilt key and the install has no C++ for it: ship every plugin's sources or use the index.
- ZN-718: `zinc doctor` prints 35 plugin lines in a source build: shorten; `zinc update` downloads but does not install: reuse `install.sh`'s swap.
- ZN-718: `zinc device update` (the agent's engine update on a device) still only downloads and verifies; it could reuse `updateCommand` of src/tc/selfupdate.cpp to install and roll back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc doctor prints a short plugin summary in a source build
- [ ] #2 zinc update installs, not only downloads
- [ ] #3 A project with plugin options finds its prebuilt or its sources
<!-- AC:END -->
