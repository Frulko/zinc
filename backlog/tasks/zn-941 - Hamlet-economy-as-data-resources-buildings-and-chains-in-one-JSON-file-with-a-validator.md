---
id: ZN-941
title: >-
  Hamlet: economy as data: resources, buildings and chains in one JSON file with
  a validator
status: Backlog
assignee: []
created_date: '2026-11-01 12:59'
labels:
  - hamlet
  - demo
  - m1
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-939
ordinal: 700020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/hamlet/data/economy.json declares resources, building types (cost, workers, inputs, outputs, work seconds, gather target, model id, label) and chains; constants.ts keeps no building list. The file is the only place a chain is added. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Schema documented at the top of economy.json (or economy.schema.md) with resources[], buildings[] {id,label,cost{},workers,role,inputs{},outputs{},seconds,gather,model,needsRoad,housing}
- [ ] #2 loadEconomy(text) validates: unknown resource ids, cycles without a raw source, a building with no model, negative numbers each give a named error (T0 test with one bad file per rule)
- [ ] #3 The three current buildings (house, sawmill, lodge) are expressed in the file and BUILDING_COST/NAMES/TOOL_LABELS are generated from it; hamlet.sh rules pass unchanged
- [ ] #4 A chain report (tools script or test output) lists each resource with its producers and consumers
<!-- AC:END -->
