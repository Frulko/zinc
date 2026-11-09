---
id: ZN-1048
title: 'zinc:sonos and iPod Sonos: queue, ports, docs'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:39'
labels:
  - ipod
  - sonos
  - size-S
  - demo
milestone: m-9
dependencies: []
ordinal: 15100
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sonos playback is limited to the song picked; the plugin cannot address a speaker with a port; docs and manifest disagree.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- iPod Sonos: queue the songs before the one picked too (add at a position), so previous works across the whole list.
- iPod Sonos: carry the position over when switching output (seek after the first play); try Sonos's batch add (16 songs per call) on a real speaker for long lists.
- zinc:sonos: let a speaker's address carry a port, so tests no longer patch :1400 (SoCo parity batch 1, docs/reports/sonos-soco-parity.md).
- zinc:sonos: docs/plugins/sonos.md says the plugin needs the process permission, plugin.json asks only for net: check and fix.
- iPod demo: the queue copied to a Sonos speaker is capped at 1,000 entries; page it in.
- iPod radio on Sonos: "Start radio" before the group's queue was read can mirror the first append wrongly; read the group first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Songs before the one picked are queued (add at a position); position carried over when the output switches; queue over 1,000 entries paged in
- [ ] #2 A speaker address may carry a port, so tests stop patching :1400
- [ ] #3 docs/plugins/sonos.md and plugin.json agree on permissions
- [ ] #4 Start radio reads the group queue first
<!-- AC:END -->
