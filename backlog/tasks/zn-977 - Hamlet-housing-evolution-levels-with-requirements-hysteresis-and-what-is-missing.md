---
id: ZN-977
title: >-
  Hamlet: housing evolution: levels with requirements, hysteresis and 'what is
  missing'
status: Backlog
assignee: []
created_date: '2026-11-01 13:12'
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
- [ ] #1 Levels and requirements are data in economy.json; house model changes per level (3 lit models)
- [ ] #2 Evolve/devolve with hysteresis tested over time; capacity grows per level
- [ ] #3 Click or hover on a house shows the failed requirement as text (and hint)
<!-- AC:END -->
