---
id: ZN-946
title: 'Hamlet save: refuse future versions, storage-free snapshot'
status: Done
assignee: []
created_date: '2026-11-01 13:00'
updated_date: '2026-11-09 04:46'
labels:
  - hamlet
  - demo
  - m1
  - save
  - multiplayer-seam
  - size-M
milestone: m-30
dependencies:
  - ZN-943
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Rename: Hamlet save: refuse future versions, storage-free snapshot.

The save keeps people, deer, stocks, tick and PRNG, in one text line per town, and the snapshot/restore code is separate from zinc:storage so a server can reuse it. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 snapshot()/restore() work on a string and a World with no storage import; save.ts only wraps them
- [x] #2 H2 round trip: stateHash before == after for a village with stocks, workers mid-job, deer, 600 ticks played
- [x] #3 H1 saves still load (test fixture from the current format)
- [x] #4 Unknown future versions are refused with a message, not a crash
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. Save is versioned (H19 to H22 all still load, examples/hamlet/src/world/save.ts:71); the Command log exists. Left: refuse unknown future versions with a message and a storage-free snapshot/restore.

Done 2026-11-09 (worktree agent).
- src/world/snapshot.ts holds snapshot() and restore(text): Restored; no zinc:storage import. save.ts only wraps them (saveGame, loadGame, eraseSave). Menu slots and the tests import snapshot.ts.
- Version check is typed: checkSave(text) gives Restored {check: SaveCheck (Current, Older, TooOld, Future, NotASave), version, message}; restore() returns it, ok() for Current/Older. A newer version is refused before its fields are read (its layout is unknown); SAVE_OLDEST = H19 in constants.
- A refused save (Future or TooOld) found at start-up is kept under hamlet:save:<version> before the new village autosaves over the slot; the status strip shows the sentence (seen in a headless shot).
- Fixture tests/data/hamlet/save-h22.txt (current format, 600 ticks, workers mid-job, deer); rules.ts checks it loads, the 600-tick round trip keeps stateHash with stocks, busy workers and deer, a future/short-future/stranger/H17 text is refused with the village untouched.
- Decision: snapshot/restore read and write the module's World (world/world.ts is the one World of a process); a server keeps one town per VM. Passing a World value through the whole engine is not worth it now.
- Hash and save still leave out positions, jobs and deer (stateHash says so): a restore keeps the hash but a resumed run does not match an uninterrupted one (later.md line).
Proof: rules.ts ALL PASS on --native, --interp, --engine quickjs (statehash 439471005 on all three); T0 hamlet_footprints, hamlet_missions, hamlet_bounds, hamlet_generation PASS; headless app run with an H23 save: message shown, save kept.
Research (sonnet sub-agent): OpenTTD savegame versions SLV_* and IsSavegameVersionBefore, every build loads every older save https://docs.openttd.org/source/d6/dd4/saveload_8h_source.html https://wiki.openttd.org/en/Archive/Manual/Savegame ; refuse newer saves with your own clear text https://www.tt-forums.net/viewtopic.php?p=175543 ; pure snapshot(state)/restore(string), storage only moves strings; round trip + continue N ticks vs uninterrupted run as the desync test (Fiedler https://gafferongames.com/post/deterministic_lockstep/).
Proposed tests: tests/t1/hamlet.sh as it is (rules.ts now covers the H22 fixture and future refusal; ~1 min, <300 MB); a later T0 hamlet_save running only the save checks of rules.ts on 3 engines (~20 s, <200 MB).
<!-- SECTION:NOTES:END -->
