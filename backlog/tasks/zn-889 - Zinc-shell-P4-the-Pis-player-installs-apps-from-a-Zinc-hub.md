---
id: ZN-889
title: 'Zinc shell P4: the Pi''s player installs apps from a Zinc hub'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-30 22:04'
updated_date: '2026-10-30 22:23'
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
- [x] #1 app/hub-server keeps one package per target (target= and kind= in the signed manifest), the catalog lists them
- [x] #2 zinc publish --target rpi [--export] publishes a .zapp or an export for a Pi
- [x] #3 the player has hub pages: pair with a hub, browse, install into the agent's apps layout with the existing checks, launch
- [x] #4 tests/t1/hub_server.sh covers two targets of one app
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done on the Mac (986770bf1 after cherry-pick): hub keeps one package per (channel, target), zinc publish --target rpi|rpi2|rpi1 [--export], player '+' -> Get apps page pairs with a hub and installs into the agent's apps. hub_server and hub_app pass. Left for the Pi: publish one .zapp and one export from the Mac, install both on the Pi over Wi-Fi, launch, Home; --export never run (cross build).
<!-- SECTION:NOTES:END -->
