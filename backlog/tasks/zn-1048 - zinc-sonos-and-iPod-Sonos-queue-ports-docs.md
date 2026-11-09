---
id: ZN-1048
title: 'zinc:sonos and iPod Sonos: queue, ports, docs'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:39'
updated_date: '2026-11-09 08:32'
labels:
  - ipod
  - sonos
  - size-S
  - demo
milestone: m-9
dependencies: []
ordinal: 15100
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
- [x] #1 Songs before the one picked are queued (add at a position); position carried over when the output switches; queue over 1,000 entries paged in
- [x] #2 A speaker address may carry a port, so tests stop patching :1400
- [x] #3 docs/plugins/sonos.md and plugin.json agree on permissions
- [x] #4 Start radio reads the group queue first
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-09 (worktree agent).
Research (sonnet sub-agent, SoCo core.py https://github.com/SoCo/SoCo/blob/master/soco/core.py): AddURIToQueue/AddMultipleURIsToQueue take DesiredFirstTrackNumberEnqueued (1-based position, 0 = the end) and EnqueueAsNext; SoCo sends 16 URIs per AddMultipleURIsToQueue and appends only; get_queue is one Browse of Q:0 (StartingIndex, RequestedCount) and callers page by TotalMatches; play_from_queue = SetAVTransportURI x-rincon-queue:<uid>#0, Seek TRACK_NR, Play; a Seek REL_TIME right after Play can be refused with 701 while the speaker is TRANSITIONING: read GetTransportInfo and retry rather than sleep; SoCo takes the port as its own argument (SoCo(ip, port=1400)).
Done:
- #1 player.ts loadOnSonos puts the whole list on the group (up to 40,000, Sonos's own limit, around the current entry): the current entry and the 15 after it first, Play, then the songs before it added at position 1 (the one playing moves to k + 1, Previous goes back through the whole list) and the rest appended, 16 per call (the plugin's chunks). sonosFrom/sonosLen are the final ones from the start, so edits queued meanwhile go after the pages in order. The moment carried over on an output switch: seekPlaying() retries a Seek refused with 701 (up to 8 times, the group read between).
- #2 already true since e63b594a2 (2026-10-29): soap/hostPort take 'ip' or 'ip:port' and Speaker.port comes from the topology's Location, so the tests pass 127.0.0.1:<port> and nothing patches :1400. The stub speaker now also takes port 0 (a free port, written to <log>.port), used by the new test.
- #3 docs/plugins/sonos.md said net and process; the plugin uses zinc:socket, fetch, zinc:net (net) and zinc:os networkInterfaces (no permission): the docs now say net only, as plugin.json.
- #4 attachTo (a restored session's group read) is one tracked promise: a list played meanwhile wins (a generation check on loads) and attach returns false without touching sonosFrom; Start radio awaits groupRead() before playList, so its songs go on the group at the places the app knows.
Proof: new tests/t1/ipod_sonos_queue.sh (fixture tests/data/ipod-sonos-queue/main.ts drives player.ts without the UI; stub --house --transition): 40 songs from the 11th (10 added in front at 1, the 11th playing), 1,100 entries from the 601st (all on the group in order, the 601st playing), an attach during a load returns false, Salon to Bureau at 12 s (Seek REL_TIME 0:00:12 fault 701, then 0:00:12). PASS in 23 s. sonos_plugin PASS (the stub change). ipod_sonos itself not run: the app does not compile on develop (see ZN-1049's notes, Z0103 'El | Failure' vers 'Failure' from examples/ipod-web/src/services/subsonic.ts).
later.md (proposed): - ZN-1048: try AddMultipleURIsToQueue at a position (16 per call) and a 10,000-song queue on a real speaker: the stub accepts any position, a real one may refuse past its length or be slow.
Proposed tests: ipod_sonos_queue (new T1, ~25 s, ~200 MB); ipod_sonos once the app compiles (~1.5 min).
<!-- SECTION:NOTES:END -->
