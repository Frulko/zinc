---
id: ZN-1049
title: 'iPod demo tests: deterministic and independent of the machine'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:39'
updated_date: '2026-11-09 08:23'
labels:
  - ipod
  - test
  - size-S
  - demo
milestone: m-15
dependencies: []
ordinal: 10800
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
- [x] #2 Fixture iPods report a pinned capacity (ipod_nav, ipod_foryou goldens independent of free space)
- [ ] #3 ipod_demo uses a per-run disk image path
- [ ] #4 A headless test of listening.ts (play past half a song, check plays.json and history.jsonl); ipod_sonos covers remote-iPod mode
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-09 (worktree agent).
Research (sonnet sub-agent): fake clocks and condition waits instead of sleep-and-poll (Sinon/Jest fake timers https://sinonjs.org/releases/latest/fake-timers/, Go clockwork https://github.com/jonboulle/clockwork); a total order on ties (distance, then a stable key) instead of index or random-id order; per-run temp paths (mktemp/mkdtemp). Applied below.
Done:
- #1 ties: the flaky From X to Y path came from ties broken by the iPod's track ids, which libgpod makes at random on each fake iPod (dbid), not from timing. genius.ts tieOrder (title, then id) now orders equal scores in pathBetween, genius, mixes, forYou topBy and the daily-mix draw, moods.ts and radio.ts; the AudioMuse stub orders similar_tracks and find_path ties by title. Proven: ipod_deep section 1 (the fixture) passes on the interpreter and on QuickJS, and ipod_foryou section 1 (the shelves) passes on both, with the unchanged goldens.
- #1 auto sync: section 3 of ipod_deep runs the app with ZINC_DETERMINISTIC (looks every 0.2 s of the virtual clock) and ZINC_FRAMES unbounded, waits (60 s at most) until deep.v1.json says task-auto and two more looks followed the sync, then stops the app and asserts looks >= 5 and one sync. NOT PROVEN: see the blocker.
- #2: already done by d582bcfae (2026-11-03): tests/run pins ZINC_IPOD_TOTAL_BYTES and ZINC_IPOD_FREE_BYTES for every test (the fixture iPods are folders), and the goldens were rewritten then. Nothing more to do.
- #3: ipod_demo keeps the mount point /tmp/zinc-ipod-demo/Volumes/ZINCPOD (the Overview shows MOUNTED AT, so a per-run mount path would change the frame hashes), holds it with shlock (/tmp/zinc-ipod-demo.lock: another tree's run waits up to 15 min, a dead run's lock is dropped), and makes the disk image in a mktemp folder of the run. NOT RUN (the app does not compile, see below).
- #4: new tests/t1/ipod_listening.sh (two 40 s songs, Alpha played 24 s of the virtual clock then Beta double-clicked; plays.json holds one play of Alpha, history.jsonl one counted line, source mac, heard 20 to 26 s); mapped in tests/affected.json. ipod_sonos ends with a remote-iPod step: examples/ipod-web on --port 0 (the daemon now serves on a free port and prints it), the app connected with IPOD_DEMO_REMOTE picks Salon and plays the first song; the speaker log must show AddMultipleURIsToQueue with http://127.0.0.1:<daemon port>/api/file/<id>?token=secret and a 206 fetch. NOT RUN.
Blocker (develop eff1a5a2b, not this task): examples/ipod and examples/ipod-web do not compile: zinc check examples/ipod-web gives Z0103 Type non assignable: 'El | Failure' vers 'Failure', reported at a meaningless place in lib/std/web.ts (4:64, 109:3 or 121:31 depending on the entry). The source is examples/ipod-web/src/services/subsonic.ts (the iPod app imports it): with every function body there replaced by a throw except songEl and authorized, the error stays; a standalone copy of those signatures does not reproduce it. Likely from the checker changes of 2026-11-09 (beb619f27 lambda-in-field-initialiser clones and unTdz narrowing, 0d6e694d8 fields assigned in both branches, 498f78a79 widened records). Every iPod app session (ipod_deep 2 and 3, ipod_demo, ipod_listening, ipod_sonos, ipod_nav, ipod_foryou 2-6...) fails until it is fixed.
Next: once the app compiles, run tests/run --only ipod_listening, ipod_sonos, ipod_demo (macOS, alone), ipod_deep (about 5 min: over the one-minute bound, for the owner) and tick #1, #3, #4.
Proposed tests: ipod_listening (new T1, ~1 min, ~300 MB); ipod_sonos with the remote step (~1.5 min); ipod_deep (~5 min); ipod_demo (~2 min, hdiutil).
<!-- SECTION:NOTES:END -->
