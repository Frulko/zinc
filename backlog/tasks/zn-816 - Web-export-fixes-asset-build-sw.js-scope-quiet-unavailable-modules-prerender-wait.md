---
id: ZN-816
title: >-
  Web export fixes: asset build, sw.js scope, quiet unavailable modules,
  prerender wait
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-M
milestone: m-14
dependencies: []
ordinal: 9800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-?: web export does not run the asset build (zinc:assets rules, atlases, tilemaps, textures), so examples/platformer fails at start; run `assets::build` and ship the output as web assets
- ZN-?: `sw.js` is shared by every export served from the same origin and port, so a stale offline fallback can come from another demo; scope the cache or the worker by app name
- ZN-?: zinc:sprite, zinc:link and zinc:udp should answer "unavailable" quietly on the web instead of apps logging console.error (music)
- ZN-?: `zinc export` of a raw template folder should say "run `zinc new` first" instead of the reverse-DNS id error
- ZN-?: `web_dom` prerender waits a fixed six seconds and flakes under a load of 30 ("the app drew nothing"); wait on the first frame instead
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc export --target web runs the asset build so examples/platformer starts
- [ ] #2 sw.js cache is scoped by app name
- [ ] #3 zinc:sprite/link/udp answer unavailable quietly on the web
- [ ] #4 Exporting a raw template says "run zinc new first"; web_dom waits on the first frame, not 6 s
<!-- AC:END -->
