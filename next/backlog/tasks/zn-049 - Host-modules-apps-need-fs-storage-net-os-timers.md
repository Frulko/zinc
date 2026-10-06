---
id: ZN-049
title: 'Host modules apps need: fs, storage, net, os, timers'
status: Review
assignee: []
created_date: '2026-10-06 16:41'
updated_date: '2026-10-06 17:49'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: host modules sys/fs/storage/os/assets/native, plugins, default exports, class setters (set x(v) -> __set_x, obj.x = v rewritten), truthiness of nullable refs; bouncing-ball, maps/navigation, zed-editor sample run headless. Left (over budget, stop): async class methods (plugins/map), Date getHours/getMinutes, zinc:gfx createImage/destroyImage/beginImage/endImage (plugins/ink), narrowing of 'string|null' ops and null|callback to Dyn in lib/std ui/solid/kit (hero). AC1-3 open.
<!-- SECTION:NOTES:END -->
