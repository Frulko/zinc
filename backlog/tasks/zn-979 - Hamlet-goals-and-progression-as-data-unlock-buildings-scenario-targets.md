---
id: ZN-979
title: 'Hamlet: goals and progression as data: unlock buildings, scenario targets'
status: Done
assignee: []
created_date: '2026-11-01 13:13'
updated_date: '2026-11-01 15:09'
labels:
  - hamlet
  - demo
  - m3
  - progression
  - size-M
milestone: m-30
dependencies:
  - ZN-970
  - ZN-944
ordinal: 740060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Settlers Online-like progression: goals.json with conditions (population, stock, building present) and rewards (unlock building, stock, reveal region). Tutorial goals teach the first chain. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Goal conditions evaluated in a daily slice; reward applied via a command (so it replays)
- [x] #2 Locked buildings are greyed in the toolbar with the goal that unlocks them
- [x] #3 Save H2 stores goal progress
- [x] #4 A tutorial goal chain for wood -> planks -> house
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: economy.json goals[] (id, title, text, requires earlier goals, when: building/stock/population/houses conditions, reward unlock + give, final) with validator errors (bad-goal); rules/goals.ts (goalReady, applyGoal, lockText, isUnlocked, goalList, scenarioWon); rules/commands.ts (Command log in world.log, issue, replayAt): the reward is the goal command, logged with its tick; the daily slice evaluates goals (only when world.progression, which tests turn off); a 10-goal chain: wood -> sawmill -> planks -> lodge, fishery ... up to the final goal; save H12 stores goals done and unlocked types. UI hooks: checkTool returns PLACE_LOCKED (6) and PLACE_NO_LODE (5) which ui/Placement.ts has no text for yet, lockText(type) for the greyed toolbar, world.news (lines to show then clear), goalList(). Note: AC 3 asked for save H2; the save is at H12 by now, goals are fields 12 and 13. The hud advice line should skip locked buildings (it still names a hint for each building type, hud.ts is the UI agent's). Test: rules.ts goals block.
<!-- SECTION:NOTES:END -->
