---
id: ZN-049
title: 'Host modules apps need: fs, storage, net, os, timers'
status: Backlog
assignee: []
created_date: '2026-10-06 16:41'
labels:
  - size-L
dependencies: []
ordinal: 32200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The zinc:* host modules of the examples (fs, storage, net/fetch, os, sys, timers, clipboard) on the new engine, written in Zinc over host calls like zinc:gfx, with the same headless determinism. Goal: every example under examples/ compiles and runs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the examples of examples/ (hero, bouncing-ball, maps, remarkable, zed-editor sample) run headless on the new engine
- [ ] #2 pixel goldens where they exist match
- [ ] #3 host modules documented with their capability per target
<!-- AC:END -->
