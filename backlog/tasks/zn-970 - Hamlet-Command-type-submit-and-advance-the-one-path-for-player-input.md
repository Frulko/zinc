---
id: ZN-970
title: 'Hamlet: Command type, submit and advance: the one path for player input'
status: Done
assignee: []
created_date: '2026-11-01 13:09'
updated_date: '2026-11-09 04:54'
labels:
  - hamlet
  - demo
  - m2
  - multiplayer-seam
  - size-M
milestone: m-30
dependencies:
  - ZN-939
  - ZN-941
ordinal: 11200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Route place/demolish/road/pause through issue(); same hash on 3 engines.

Every player action becomes data (Command {tick, player, type, args}); the scene calls submit(cmd) and the sim consumes the queue at the tick. Single-player uses the same path a server will use. No network code. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Commands for place, demolish, road drag, pause defined as data; HamletScene no longer calls applyTool directly
- [x] #2 advance(n) steps n ticks consuming commands in order; two runs with the same command list give the same stateHash on the 3 engines
- [x] #3 Command validation lives in rules/ and rejects with a reason (shown by the HUD)
- [x] #4 The scripted session of hamlet.sh runs through submit
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. src/rules/commands.ts routes goals, trades, adventures through issue() with a log; placement, demolition and roads still call the tools directly.

Done 2026-11-09 (worktree agent).
- Command is data: {tick, player, type, args, result}; types place [building type, tile], road [start, end, flip, routed], demolish [start, end, flip], pause [1|0], and the campaign's goal, trade, adventure_start, adventure_return. `kind/a/b` are gone (tests follow).
- rules/commands.ts: command(), validate(c) gives PLACE_OK or a PLACE_* reason (the HUD says it through ui/Placement reasonText), execute() re-validates at its tick and logs only what ran, submit() queues, runDue() runs what is due in arrival order; issue() stays for the simulation's own decisions inside a tick (goal reached, expedition back).
- engine/simulate.ts: advance(n) runs the due commands, then steps n ticks running the due ones before each; a paused village runs its commands (the unpause too) but its clock stands. play(c) = submit + advance(0): the player's path, which answers in the same frame.
- Pause is world.paused (was ui.paused), set only by the pause command. Hud and Debug read it.
- HamletScene: place, road line, demolish line and pause go through play(command(...)); the frame loop calls advance(ticks owed). Info's demolish and the Campaign's trade and adventure go through it too. Road and demolish carry the drag's ends: the plan is made again at the tick (same state, same plan). Ctrl+Z records what changed on each tile (a building once): razing trees no longer records a road that undo would lay.
- hamlet.sh: static check that the scene and its windows call no applyTool/buildRoad/demolishRoad/stepWorld/issue and submit the four commands (the old scene fails it, 5 hits); not run as a T1.
Proof: rules.ts ALL PASS on --native, --interp, --engine quickjs; commandhash 3077954668 on all three, two runs equal, the log in order (a refused place is not logged), pause holds the clock 10 frames; refused place gives PLACE_BLOCKED, an unpaid road PLACE_NO_STOCK, nothing logged. Headless app, 400 frames of session.input: road drag, three houses and a lumber hut saved; the HUD shows a refusal sentence (shot looked at).
Research (sonnet sub-agent): AoE 1500 archers, commands as data per turn https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond ; Fiedler, inputs tagged with their tick and a checksum per tick https://gafferongames.com/post/deterministic_lockstep/ ; Factorio's input actions run after a fixed latency, never dropped https://factorio.com/blog/post/fff-76 https://factorio.com/blog/post/fff-302 ; OpenTTD test then exec phases, the exec must check again and carry its error https://sources.debian.org/src/openttd/14.1-1/src/command_func.h ; order by (tick, player, sequence), pause as a command.
Proposed tests: tests/t1/hamlet.sh as edited (rules on 3 engines with commandhash compared, static submit check, the mouse sessions; ~2 min, <500 MB); tests/data/hamlet/rules.ts --only the command block as a T0 later (~20 s, <200 MB).
<!-- SECTION:NOTES:END -->
