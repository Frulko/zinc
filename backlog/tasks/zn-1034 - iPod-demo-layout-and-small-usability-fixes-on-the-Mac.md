---
id: ZN-1034
title: 'iPod demo: layout and small usability fixes on the Mac'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
labels:
  - ipod
  - ui
  - size-M
  - demo
milestone: m-15
dependencies: []
ordinal: 17300
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small defects of examples/ipod seen at normal window sizes plus the missing hooks of the toast kit.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- iPod web: the Songs page renders every row (2400 songs = 34k DOM nodes, heap 16→105 MB); use a virtual list.
- ZN-857: the iPod demo's album grid should take its column count from the window width (fixed at 4 now); a wider window wastes space.
- ZN-857: the Optimise page could offer one-click fixes for its other findings (fill missing tags or covers from a duplicate or online, delete empty playlists).
- iPod demo: the arrows of an album's or playlist's rows show progress during a whole-album download (needs per-track progress from ipod.onProgress).
- iPod demo: "Show details" on a failed toast opens the failed job's row on Transfers, not just the page.
- kit: toast() and addToast return a handle that can be updated (title, progress, actions), so apps do not each rebuild a live toast like the iPod demo's.
- iPod demo: covers in the cache are not invalidated after setArtwork (one size per album); invalidate by track when the cover changes.
- iPod demo: history entries survive opening another iPod; reset the history when a device opens.
- iPod demo: the Devices page does not show the "waiting for the iPod" line yet (the signal exists).
- iPod demo: the track tables at 1180 px leave the Title column a few characters wide beside Artist and Album/Why; give Title a minimum width or narrow the fixed columns.
- iPod demo: AudioMuse auto-sync only follows analysis tasks; a clustering run that ends after one does not sync again.
- iPod demo: "From A to B" drafts last only for the run (not kept in genius.json like the Genius lists).
- iPod demo: the mood mixer's tempo bar and the volume bar are click-only; add dragging to both.
- iPod demo: the now-playing display is crowded at 1180 px (the time label touches the cover).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Album grid column count follows the window width; Title column keeps a minimum width at 1180 px; the now-playing time label no longer touches the cover
- [ ] #2 Devices page shows the waiting-for-the-iPod line; history resets when another iPod opens; covers cache invalidated after setArtwork
- [ ] #3 kit toast()/addToast return an updatable handle (title, progress, actions); the failed toast "Show details" opens the job row; album rows show per-track progress
- [ ] #4 The mood mixer tempo and volume bars drag; "From A to B" drafts are kept in genius.json
- [ ] #5 T1 of the demo still passes
<!-- AC:END -->
