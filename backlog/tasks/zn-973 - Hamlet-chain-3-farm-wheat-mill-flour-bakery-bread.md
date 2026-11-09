---
id: ZN-973
title: 'Hamlet: chain 3: farm -> wheat -> mill -> flour -> bakery -> bread'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 13:10'
updated_date: '2026-11-09 05:16'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-944
ordinal: 18300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Houses of level 2 eat bread; chain report shows no orphan.

Data plus three models; farms use cleared land (a field footprint of tiles). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 economy.json entries and models for farm, mill, bakery; fields drawn as tile decor
- [x] #2 Houses of level 2 may eat bread (see housing levels)
- [x] #3 Chain report shows no orphan resource; scripted run reaches bread
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Farm (no input, 2 wheat / 10 s), mill (2 wheat -> 1 flour), bakery (1 flour -> 2 bread); houses eat smoked meat, bread or fish. Fields as tile decor not drawn (the farm model carries its own wheat rows). AC2 (houses of level 2) waits for housing levels ZN-977: houses simply accept bread now. Orphan check: hide has no consumer until the tannery (ZN-974).

Left open: AC2 (needs ZN-977 housing levels) and AC3 (the orphan report still lists hide until ZN-974 adds the tannery). Next: tests/run --only hamlet after those.
Review 2026-11-07: done-partly. economy.json has farm, mill and bakery (criterion 1 ticked); bread for houses and the orphan report remain.

Closed 2026-11-09.
- AC2: the housing levels of ZN-977 already count bread among the food kinds of every level; the Demeure (level 2, capacity 6) asks two kinds. rules.ts now checks that the house that reaches level 2 ate bread (cabin.fed[bread] > 0), beside smoked meat. Bread stays an alternative food, not a level-2-only one: the start stock holds bread and the first houses eat it.
- AC3: chainReport and the new orphanResources() (examples/hamlet/src/world/economy.ts) share one walk per resource and count the peddler (coin, for buying) and adventure costs as users; the old test-only orphan line missed them and the house lights, so it listed coin and candle (hide had its tannery since ZN-974). Orphans now: none, checked.
- Chain 3 is now a scripted run through commands (play: road, three houses, farm, mill, bakery; advance 300 s): 6 settlers take the jobs, bread 20 -> 40 (the bakery stops at the bread target), 16 flour, 36 wheat. New hash line 'hamlet rules: breadhash 245942641', the same on interpreter, AOT and QuickJS; hamlet.sh compares it with the others. statehash, commandhash, replayhash and every other hash unchanged (no economy data changed).
- Ran: tests/data/hamlet/rules.ts headless on the three engines (ALL PASS each, 18 s, 18 s, 40 s), one ZINC_SHOT of a built village (mill and bakery say 'Il manque : Blé / Farine' without a farm).
- Research (sonnet sub-agent): Anno 1404 bread 2 farms : 1 mill : 1 bakery, Anno 1800 2:1:2 (https://steamcommunity.com/app/916440/discussions/0/2530372519571599898); Anno 117 2 farms : 1 mill : 2 bakeries (https://www.gamesradar.com/games/simulation/anno-117-pax-romana-production-ratios-perfect); Settlers III about 1 farm per mill, 1 mill per 3 bakeries, Settlers II 1 mill per bakery (https://strategywiki.org/wiki/The_Settlers_III/Goods, https://gog.com/forum/the_settlers_series/settlers_ii_building_ratio); Anno 1800 gates bread at tier 2 (Workers) and each food is its own need, not an alternative (https://www.ludo.guide/guide/anno-1800/getting-started/meeting-population-needs/population-tiers-upgrades, https://www.anno-union.com/?p=9779); bread is the slowest-eaten food there, so one bakery feeds many houses; Timberborn's wheat-flour-bread guide (https://timberborn.org/articles/food-production-guide); a calculator (https://space4games.com/en/tool/anno-1800-calculator/). Hamlet: farm 2 wheat/10 s, mill 2 wheat -> 1 flour/6 s, bakery 1 flour -> 2 bread/6 s, so about 3 farms : 1 mill : 1 bakery at full speed (soil speeds farms up); kept, foods stay alternatives counted by kinds (Hamlet's 'two kinds for level 2' is the Anno variety ladder made forgiving for first players).

**Proposed tests**
- tests/run --only hamlet (T1, already exists): the rules on three engines incl. breadhash and the orphan check, plus the mouse session; about 3 min, under 1 GB.
<!-- SECTION:NOTES:END -->
