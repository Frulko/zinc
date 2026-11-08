---
id: ZN-1052
title: 'iPod For you and Genius: keep the UI thread free at 10k songs'
status: Backlog
assignee: []
created_date: '2026-11-07 16:40'
labels:
  - ipod
  - perf
  - size-M
  - demo
milestone: m-21
dependencies: []
ordinal: 7800
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Genius and the daily mixes block the UI about 1.4 to 1.7 s at 10k songs and 100k listens; the SQL step, library parse and moodMix are synchronous or quadratic.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- iPod Genius: build the model and mixes off the UI thread (1.7 s on the first Playlists open for 10k songs / 100k listens), or cache them on disk per history version.
- iPod For you: the daily mixes block the UI about 1.4 s at 10k songs (genius.mixes); split them into chunks or run them in a worker.
- iPod For you: time a cached open and a full recompute on AOT on the owner's real library; log both.
- iPod moods: moodMix ranks energy with indexOf per song, O(n^2); sort once with indices for 10,000 analysed songs.
- iPod demo: Genius, For you and the cache parsing on a zinc:worker (D181 step 4) once workers land; the slices only spread the work over frames.
- iPod demo: For you's final write (JSON.stringify of the shelves and the drafts) is not sliced; genius() and the mood mixes are still synchronous.
- iPod demo: measure For you's frame gaps again now that a timer set in a frame waits for the next one (the slices were measured before that fix).
- iPod demo: a T1 frame-gap check of For you on the FORYOU_MODE=big fixture (10k songs, 100k listens); it needs a paced windowed run (headless frames are unpaced; ZINC_TRACE keeps only the last spans).
- iPod demo: For you's SQL step before the worker job (times, top artists and tracks, yearCounts, lovedOn) takes ~100 ms on the UI thread with 100k listens, mostly the JS side (rows to objects, yearCounts): slice it or count in the worker.
- iPod demo: the first sync after a library change parses library.json (10k tracks) in one 40 ms JSON.parse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 genius.mixes, genius() and the final JSON write run on a zinc:worker or in chunks; no frame gap above 50 ms on the FORYOU_MODE=big fixture
- [ ] #2 moodMix sorts once with indices (no indexOf per song)
- [ ] #3 The SQL step and the 10k-track library.json parse are sliced or counted in the worker
- [ ] #4 Before and after numbers logged in docs/reports/zinc-next-perf.md
<!-- AC:END -->
