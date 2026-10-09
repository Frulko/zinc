---
id: ZN-392
title: 'Prebuilt player runtimes per target for zinc fuse (linux, rpi, rpi1), pinned'
status: Backlog
assignee: []
created_date: '2026-10-09 00:00'
labels:
  - distribution
  - size-M
dependencies:
  - ZN-319
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-319: zinc fuse appends a .zapp to the engine running it, so it fuses for this machine only (--target of another OS is refused, naming this task). Needed: a player per target (the ZBC VM and the host runtime, without the compiler) built with the pinned zig like the AOT runtime, published with a SHA-256 pin (or built once locally into ~/.zinc/runtimes/<version>/<target>/), and zinc fuse --target T using it. A player without the compiler also shrinks the fused size (15.4 MB now, engine 13.8 MB).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc fuse --target linux on macOS gives a file that runs the app in the Linux container; the runtime is pinned (version and SHA-256) and verified before use
<!-- AC:END -->
