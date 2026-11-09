---
id: ZN-971
title: 'Hamlet: command log recorder and replay'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 13:10'
updated_date: '2026-11-09 05:08'
labels:
  - hamlet
  - demo
  - m2
  - multiplayer-seam
  - size-S
milestone: m-30
dependencies:
  - ZN-970
  - ZN-946
ordinal: 11100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Replay a scripted 2000-tick log to equal hash; corrupt line rejected.

Log = seed/preset + list of commands with ticks; replaying from the start reproduces the final state hash. Doubles as a regression format and as the server's authority check. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 recordLog()/replayLog(text) in a module with no storage or window
- [x] #2 Test: a 2000-tick scripted village replays to the same hash on interpreter, AOT and QuickJS
- [x] #3 A log with a corrupt command is rejected at the line number
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. Log and replayAt exist (commands.ts:26); needs recorder/replay-from-file and the 3-engine hash test.

Done 2026-11-09 (worktree agent).
- engine/replay.ts: recordLog() and replayLog(text): Replayed {check: LogCheck (Ok, NotALog, Future, BadLine, Refused, Desync), line, message, hash, expected}. No storage, no window: stepWorld no longer autosaves (the scene does it after advance), so the sim imports no zinc:storage.
- Format, one line each: 'hamlet-log 1'; the origin (a new village's start line start;seed;size;params;mission;difficulty;progression;risks;unlimited, or the save text it was restored from); '<tick> <player> <type> <args,>'; 'end <tick> <stateHash>'. Every line is parsed before the village is touched: a malformed line, an unknown command, a wrong argument count, a tick going back, a missing end line, a newer log version are refused with the line number and the village kept. A command the village refuses at its tick stops the replay at its line (Refused); a different end hash is a Desync with both hashes.
- world.origin: set by restore() to the save text, else by the first command executed (snapshot.ts startText()), reset by generate(). startVillage(text) rebuilds a start line as the new-village form does (mission and difficulty before generate).
- The simulation's own commands (goal, adventure_return) are issued as player SIM_PLAYER (-1) and not written: stepping the world makes them again. The replay steps ticks with stepWorld whatever the pause (a log holds only ticks that ran, the debug tick included).
- Made commands so the log is complete: undo (Ctrl+Z sends the drag's tiles, the undo body moved from ui/Placement to rules/commands), order (storage orders, Info), priority (labour, Advisors), unlimited (U key, options, dev panel), progression (Continue after a won scenario). hamlet.sh's static check also refuses setOrder/movePriority in the scene and windows.
Proof: rules.ts ALL PASS on --native, --interp, --engine quickjs; replayhash 4186279753 on all three (statehash 439471005 and commandhash 3077954668 unchanged): a 2000-frame scripted village (roads, houses, sawmill, hut, store with a get order, priority, pause, unlimited, lodge placed then undone, demolition) recorded from a save origin replays to the same hash and records the same text; a new village's start-line log replays; corrupt args at line 5, unknown command at line 6, tick back at line 7, cut log, newer version, stranger text all refused with the village hash kept; a refused place stops at line 5; a wrong end hash is a Desync. zinc check examples/hamlet clean; headless app 900 frames of session.input, autosave written from the scene, shot looked at.
Left outside the log: the dev panel's walk speed and regrowth settings (settings.walkSpeed, treeMin, treeRegrow, deerMin, deerRespawn) are read by the sim from local prefs, so a replay on another machine with other prefs desyncs (later.md line). A log is read only with the same economy.json (no hash of it in the header).
Research (sonnet sub-agent): OpenTTD commands.log replayed from a start save, same version required, checkpoints to bisect https://sources.debian.org/src/openttd/15.1-1/docs/debugging_desyncs.md https://sources.debian.org/src/openttd/15.1-1/docs/desync.md ; Factorio replays are input actions only and locked to the version that wrote them, one bad action poisons the rest https://forums.factorio.com/viewtopic.php?p=608167 https://forums.factorio.com/101294 ; StarCraft II picks the decoder by the base build in the header, unknown build is fatal https://github.com/Blizzard/s2protocol ; Doom demos lead with a version byte and end with a quit marker https://doomwiki.org/wiki/Demo ; lockstep advice: initial state, inputs with ticks, final or periodic hashes https://bugnet.io/blog/how-to-build-a-lockstep-determinism-checker
Proposed tests: tests/t1/hamlet.sh as edited (rules.ts on 3 engines now compares replayhash, static check covers orders and priority; ~2 min, <500 MB); a later T0 hamlet_replay running only the log block of rules.ts on 3 engines (~20 s, <200 MB).
<!-- SECTION:NOTES:END -->
