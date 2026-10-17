---
id: ZN-755
title: 'Music remote: weather city search, and a StandBy screen schedule'
status: Backlog
assignee: []
created_date: '2026-10-17 08:46'
labels:
  - mobile
  - ui
  - size-M
milestone: m-26
dependencies: []
ordinal: 196100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17, examples/music on the Nexus 7: in the settings, the weather's city through a search field and a list of results (Open-Meteo geocoding, debounced, city/region/country), stored in config.json; the screen goes off after the settings' delay, and on the clock slide after 2 minutes, then wakes for a moment every 5 minutes (iOS StandBy's manner), notifications waking it too (ZN-758). Design: ../docs/reports/notification-relay-design.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the settings' city search finds and stores a city; the weather slide shows it (a scripted session on the desktop, and on the Nexus 7)
- [ ] #2 the clock slide's schedule: off at 2 min, a wake every 5 min, measured on the Nexus 7 through dumpsys window brightness
<!-- AC:END -->
