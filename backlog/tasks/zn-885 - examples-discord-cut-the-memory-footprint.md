---
id: ZN-885
title: 'examples/discord: cut the memory footprint'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 21:05'
labels:
  - perf
  - size-M
milestone: m-28
dependencies: []
ordinal: 579460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner measured 351 MB in Activity Monitor's Memory column (physical footprint; Real Mem 45 MB) for the Discord client after a call. DiscordLite's spirit is low RAM. Measure what holds the footprint (tools/window-memory, footmem/vmmap/heap: READY JSON kept, decoded images and their sizes, glyph atlases, GPU textures, audio buffers, plugin allocations), fix the biggest holders in the engine or the app, and log before/after in the task notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A breakdown of the footprint by holder, measured, in the task notes
- [ ] #2 The biggest holders cut; footprint after login + a channel + a call measured before and after
<!-- AC:END -->
