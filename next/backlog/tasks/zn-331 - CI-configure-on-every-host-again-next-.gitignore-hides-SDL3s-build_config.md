---
id: ZN-331
title: 'CI: configure on every host again (next/.gitignore hides SDL3''s build_config)'
status: Review
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 03:40'
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
- [x] #1 a fresh `git clone` + `cmake -S next -B build` configures with no missing file (checked in a T0 test that lists the files cmake needs against `git ls-files`)
- [ ] #2 the linux-x86_64, linux-aarch64 and macos-arm64 jobs of zinc-next.yml pass build and T1
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-09: fresh clone (git clone --depth 1 of HEAD) configured, but did not compile: runtime/gfx.cpp (committed in e0a02eaa) uses HalCmdList and HalFrame.frames, whose declaration stayed in the uncommitted runtime/include/hal.h; that hunk is now committed (the whole uncommitted diff of hal.h, which is exactly it). With it the clone builds zinc and runs. New T0 tests/t0/build_inputs_tracked.sh: every repository file cmake reads at configure (Makefile.cmake) or a source includes (compiler_depend.make) is tracked by git (2880 inputs; checked to fail on a file removed from a copied index). Warnings of a fresh build fixed: stb_image unused functions in src/text/sbix.cpp, && within || in src/test_cmd.cpp. Left for a person: push (296 commits ahead of origin), then check that the linux-x86_64, linux-aarch64 and macos-arm64 jobs of zinc-next.yml pass (gh run list --workflow zinc-next.yml) and tick AC #2. usage: n/a

2026-10-09 (ZN-332): in an ubuntu:24.04 container SDL3's configure stops without X11 dev packages (libx11-dev libxext-dev libxcursor-dev libxi-dev libxrandr-dev libxss-dev libxfixes-dev libxtst-dev, plus libgl/egl/drm/gbm dev); the CI's Linux step installs none of them. GitHub's ubuntu-24.04 image may carry them; if the CI job fails at configure, add them to that apt-get line. GCC/glibc compile fixes landed in 5672488a.
<!-- SECTION:NOTES:END -->
