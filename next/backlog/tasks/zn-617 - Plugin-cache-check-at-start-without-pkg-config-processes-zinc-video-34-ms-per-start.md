---
id: ZN-617
title: >-
  Plugin cache check at start without pkg-config processes (zinc:video 34 ms per
  start)
status: Backlog
assignee: []
created_date: '2026-10-10 11:22'
labels:
  - perf
milestone: m-21
dependencies:
  - ZN-615
ordinal: 376270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From ZN-615: with the library loaded at the first call, a start still pays buildPlugin's cache check for every plugin the program imports: zinc:video 34-39 ms, lottie 9 ms (hero, Intel Mac, zinc -v). For video, buildPlugin spawns sh with pkg-config --exists, --cflags and --libs (about 20 ms) and regenerates the spec's header and thunk (frontend::generateNative) to compute the key. Cache the pkg-config answer and the generated code per plugin directory, keyed by the spec's content and the mtimes of the .pc files pkg-config used, and measure hero's start (10 starts, before and after).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero's cached interpreted start no longer runs pkg-config when nothing changed
- [ ] #2 a changed .pc file or spec still rebuilds the plugin (test)
- [ ] #3 start time measured before and after in docs/reports/zinc-next-perf.md
<!-- AC:END -->
