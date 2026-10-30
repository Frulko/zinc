---
id: ZN-889
title: 'Zinc shell P4: the Pi''s player installs apps from a Zinc hub'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:04'
labels:
  - size-L
  - pi
  - ui
milestone: m-25
dependencies: []
ordinal: 583460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase of the Zinc shell (D194, docs/reports/zinc-shell/03-design.md §8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 app/hub-server keeps one package per target (target= and kind= in the signed manifest), the catalog lists them
- [ ] #2 zinc publish --target rpi [--export] publishes a .zapp or an export for a Pi
- [ ] #3 the player has hub pages: pair with a hub, browse, install into the agent's apps layout with the existing checks, launch
- [ ] #4 tests/t1/hub_server.sh covers two targets of one app
<!-- AC:END -->
