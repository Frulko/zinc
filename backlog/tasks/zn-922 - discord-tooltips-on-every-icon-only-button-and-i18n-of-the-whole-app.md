---
id: ZN-922
title: 'discord: tooltips on every icon-only button and i18n of the whole app'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 09:31'
labels:
  - discord
  - ui
dependencies: []
ordinal: 616460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: every button that has only an icon needs a tooltip, everywhere, and everything translated (i18n everywhere). zinc:ui/kit already has Tooltip and lib/std/i18n.ts a Catalog; Discord uses neither.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every icon-only button in examples/discord has a Tooltip (kit) with its translated label, also reachable by keyboard focus, and an aria-label
- [ ] #2 Every user-visible string of examples/discord goes through the i18n catalog (en as the source, fr complete, language picked from the system and changeable in settings), including plurals, dates and error messages
- [ ] #3 A test that fails when a visible string or an icon-only button has no catalog entry or tooltip
- [ ] #4 Slack theme checked on a frame with DISCORD_THEME=slack (aubergine sidebar visible)
<!-- AC:END -->
