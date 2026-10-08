---
id: ZN-331
title: 'CI: configure on every host again (next/.gitignore hides SDL3''s build_config)'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - ci
  - distribution
  - size-S
milestone: m-19
dependencies: []
ordinal: 54990
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
next/.gitignore has `build*/`, which also ignores next/third_party/SDL3/include/build_config/ (SDL_build_config.h.cmake, SDL_revision.h.cmake): every job of .github/workflows/zinc-next.yml fails at cmake configure since at least run 37625557372 (2026-10-07). Anchor the rule (`/build*/`), add the missing files, and make a fresh clone configure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a fresh `git clone` + `cmake -S next -B build` configures with no missing file (checked in a T0 test that lists the files cmake needs against `git ls-files`)
- [ ] #2 the linux-x86_64, linux-aarch64 and macos-arm64 jobs of zinc-next.yml pass build and T1
<!-- AC:END -->
