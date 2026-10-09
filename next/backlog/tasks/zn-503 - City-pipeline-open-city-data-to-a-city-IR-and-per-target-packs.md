---
id: ZN-503
title: 'City pipeline: open city data to a city IR and per-target packs'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-489
  - ZN-452
ordinal: 300500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
For a Tokyo-class city: fetch and pin open data (PLATEAU buildings, OSM roads and rails, GSI elevation) for one district, or reuse the MIT Procedural Tokyo exporter through tools/cdp.py; build a city IR (buildings with footprints and heights, facade kinds, lamps, roads); cook prisms LOD (roof grid, straightened terraces, mid 1/4 and far 1/20 of near), cells/blocks/regions, index groups by cell and 16 wall sectors, height map, lamp map, facade atlases (day and night), streamed near-cell records. Attribution and ODbL obligations documented. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The district cooks for psp30, vita60, n3ds30 and ios60 within each profile's pack budget
- [ ] #2 The pack viewer flies the city tour; triangle counts per LOD in the receipt
- [ ] #3 Data licences and attribution are in the receipt and the demo credits
<!-- AC:END -->
