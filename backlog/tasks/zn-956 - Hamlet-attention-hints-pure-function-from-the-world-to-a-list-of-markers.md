---
id: ZN-956
title: 'Hamlet: attention hints: pure function from the world to a list of markers'
status: Review
assignee: []
created_date: '2026-11-01 13:04'
updated_date: '2026-11-01 14:34'
labels:
  - hamlet
  - demo
  - m1
  - ui
  - indicators
  - size-S
milestone: m-30
dependencies:
  - ZN-943
ordinal: 700170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
What the player must look at: a placed building with no road to the gate, a house without work, an idle resident, a site without workers, a producer 'full' or 'waiting', a missing input, a deliver spot. Pure, in rules/, no drawing. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 computeHints(world) returns [{kind, tile, reason, severity}] sorted by severity, capped at 12
- [x] #2 Kinds: no_road, idle_workers, no_input, full_output, deliver_here, build_next (first-run hint after the gate)
- [x] #3 T0 test per kind with a tiny constructed world
- [ ] #4 Reasons are short English keys that hud.ts maps to text (the HUD advice line uses the top hint)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
rules/hints.ts: computeHints() pure, Hint {kind, tile, reason, severity}, sorted, capped at 12; kinds no_road, idle_workers, no_input, full_output, deliver_here (a wait whose resource a store holds), build_next. hintText(h) maps the reason keys to HUD sentences. Left open (AC4): the HUD advice line in hud.ts still derives its own sentence from building states (the simulation agent's file, in flux); wiring is adviceLine returning hintText(computeHints()[0]). Test: tests/t0/hamlet_hints.sh.
<!-- SECTION:NOTES:END -->
