---
id: ZN-1049
title: 'iPod demo tests: deterministic and independent of the machine'
status: Backlog
assignee: []
created_date: '2026-11-07 16:39'
labels:
  - ipod
  - test
  - size-S
  - demo
milestone: m-15
dependencies: []
ordinal: 10800
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Several iPod T1 tests depend on timing, the host disk or a shared path.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- iPod Sonos: cover remote-iPod mode in tests/t1/ipod_sonos.sh (daemon on a free port, the speaker receives the /api/file?token= URL).
- iPod demo: the listening service (listening.ts) has no headless test: a scripted session that plays past half a song and checks plays.json and history.jsonl.
- iPod tests: the folder-based fixture iPods (ipod_nav, ipod_foryou) show the host disk's fullness in the sidebar storage bar, so their golden hashes depend on the machine's free space; pin the reported capacity in the fixture.
- ipod_deep: one QuickJS run of 3 gave the From X to Y path one song short (AAAAABBBBBBC instead of AAAAABBBBBBCC) while AudioMuse loaded the machine; find what in the path build depends on timing.
- iPod demo: ipod_demo uses a fixed /tmp/zinc-ipod-demo disk image, so two trees running it at once collide; use a per-run path.
- ipod_deep: its auto-sync step polls in real time and fails under load; drive it by the virtual clock.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ipod_deep: auto-sync step driven by the virtual clock; equally close songs ordered by title so the path is stable
- [ ] #2 Fixture iPods report a pinned capacity (ipod_nav, ipod_foryou goldens independent of free space)
- [ ] #3 ipod_demo uses a per-run disk image path
- [ ] #4 A headless test of listening.ts (play past half a song, check plays.json and history.jsonl); ipod_sonos covers remote-iPod mode
<!-- AC:END -->
