---
id: ZN-1052
title: 'iPod For you and Genius: keep the UI thread free at 10k songs'
status: Review
assignee:
  - '@parallel'
created_date: '2026-11-07 16:40'
updated_date: '2026-11-09 01:16'
labels:
  - ipod
  - perf
  - size-M
  - demo
milestone: m-21
dependencies: []
ordinal: 7800
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
- [x] #2 moodMix sorts once with indices (no indexOf per song)
- [x] #3 The SQL step and the 10k-track library.json parse are sliced or counted in the worker
- [ ] #4 Before and after numbers logged in docs/reports/zinc-next-perf.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-09 (worktree agent). Web search: time-sliced deadline loops (https://web.dev/articles/optimize-long-tasks, https://developer.chrome.com/blog/use-scheduler-yield) or the whole job in a worker returning compact ids; structured clones of object graphs cost per object (https://developer.chrome.com/blog/transferable-objects-lightning-fast); counts belong in SQL with an index, not in JS row loops; avoid a big JSON.parse with a compact cached form parsed per line (NDJSON).

State found: Genius' model, genius(), the mixes, the moods and For you's shelves already run in the recommendation worker (services/recommend.ts, D181) and a slice at a time where it runs inline (QuickJS); moodMix already ranks energy once through a rank map (no indexOf per song): AC2 holds. Measured here: posting 100,000 listens to a zinc:worker costs 6 ms on the UI thread (columns 2 ms), not worth changing.

Done:
- The SQL step (src/forYou.ts): History.forYouSql counts the year's listens per month in SQLite (listensIn over fy.monthEdges, 12 counts on the time index; `+skipped` keeps the planner off the skipped index, which scanned every listen: 632 ms without it), reuses the year's top 12 artists for the review's 5, and turns the event loop between queries. History.times and the per-listen Date loop are gone.
- library.json: cache.writeSnapshot also writes library-keys.jsonl (the stamp of library.json, its marker, then one line per song); syncPods reads it with readTextAsync and parses a batch of lines per slice, and falls back to the whole library.json when the file is missing or for another stamp.
- The final write of For you: JSON.stringify of the shelves measured 0 ms (11.7 KB on the bench, 1 ms at most with real ids): left as it is.

Numbers (tests/data/ipod-foryou FORYOU_MODE=bench, 10,000 songs and 100,000 listens, Apple M1 Pro, one run each while another tree built, indicative), for docs/reports/zinc-next-perf.md: interpreter, SQL step 69 ms in one block -> 7-8 ms; library.json parse 36 ms in one block -> keys file 16 ms in slices of 8 ms at most; final stringify 0 ms. Unchanged: model 527 ms (longest slice 11), signals 246 (9), daily mixes 1082 (14), mixes 1062 (14), Genius 100 16 ms, moods 6-7 ms each. QuickJS (inline, no worker): SQL 7 ms, keys 12 ms (slices 8 ms) vs library.json 57 ms, but daily mixes and mixes have slices of 73-76 ms and Genius 100 is 58 ms in one go.

Open: AC1's frame-gap check needs the paced windowed run of the app on FORYOU_MODE=big (headless frames are unpaced); AC4 waits for the coordinator to log the numbers above.

Proposed tests: (1) `tests/run --only ipod_foryou` (T1, the For you shelves and Your year on the fake iPod after the SQL change; about a minute, ~300 MB); (2) the app windowed on the FORYOU_MODE=big fixture with ZINC_TRACE, For you opened, longest frame gap read (needs a paced run; a few minutes, ~600 MB); (3) `tests/run --only ipod_history` (syncPods fallback without a keys file; ~30 s).

later.md: - ZN-1052: on QuickJS (no workers) the daily mixes and Genius' mixes still hold slices of ~75 ms and genius() 58 ms at 10k songs; QuickJS workers or smaller batches would bring them under 50 ms.
<!-- SECTION:NOTES:END -->
