---
id: ZN-977
title: >-
  Hamlet: housing evolution: levels with requirements, hysteresis and 'what is
  missing'
status: Done
assignee: []
created_date: '2026-11-01 13:12'
updated_date: '2026-11-01 14:55'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-976
  - ZN-973
ordinal: 740040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
House level 1 -> 2 -> 3 needs water, food kinds and market coverage; different evolve and devolve thresholds avoid flicker; the UI says which requirement fails. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Levels and requirements are data in economy.json; house model changes per level (3 lit models)
- [x] #2 Evolve/devolve with hysteresis tested over time; capacity grows per level
- [x] #3 Click or hover on a house shows the failed requirement as text (and hint)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: economy.json house.housing.levels (capacity, needs: services, foods, appeal), evolveDays/devolveDays/margin, mealsFrom; rules/housing.ts (capacityOf, meets, housingReport(house) -> level, next requirements, missing, atRisk, plain-words text); engine/housing.ts daily meals (a house covered by the market buys food kinds from the stores, FOOD_DAYS days each) and evolution/devolution with hysteresis, residents beyond capacity leave (evictResidents); hint house_needs (one requirement short, or about to fall back; hintText gives the report text); models house2/house3 and modelOf(type, level) used by view/scenery.ts (two lines + tile signature). Save H10. UI hook: housingReport(b).text for hover/click. Test: rules.ts housing block.
<!-- SECTION:NOTES:END -->
