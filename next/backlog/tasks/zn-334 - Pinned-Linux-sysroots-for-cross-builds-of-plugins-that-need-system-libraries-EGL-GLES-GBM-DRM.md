---
id: ZN-334
title: >-
  Pinned Linux sysroots for cross builds of plugins that need system libraries
  (EGL, GLES, GBM, DRM)
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - toolchain
  - size-M
milestone: m-19
dependencies:
  - ZN-332
ordinal: 55250
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zig gives the libc, not mesa or libdrm: display-gl for rpi/rpi1/linux cannot be cross built from macOS (pkg-config check fails). The toolchain manager fetches a pinned, checksum-verified sysroot per target (Debian bookworm and trixie: armhf, arm64, x86_64, with the -dev packages plugin.json `pkg` names), the same way as zig, and the plugin build points pkg-config at it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on macOS with nothing installed, `zinc plugin-build display-gl` for rpi (aarch64) and rpi1 (armhf) succeeds
- [ ] #2 the sysroots are pinned by sha256 in src/tc, listed in third_party/README.md style with their sources and licences, and a changed archive is refused
- [ ] #3 `zinc export --target rpi` of a display-gl UI app succeeds on macOS
<!-- AC:END -->
