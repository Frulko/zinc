---
id: ZN-843
title: 'Zinc Hub: the central app on the reMarkable'
status: Backlog
assignee: []
created_date: '2026-10-25 19:26'
updated_date: '2026-10-25 19:28'
labels:
  - remarkable
  - ui
  - size-L
milestone: m-11
dependencies:
  - ZN-841
  - ZN-842
ordinal: 552460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hub step 3 (owner 2026-10-25). A Zinc app, an AppLoad tile on the tablet, e-ink friendly (large targets, few refreshes): the hub server URL (configurable), pairing by code, the list of apps with their versions, install, update (check at start), rollback, channel stable or beta. Every installed app becomes its own AppLoad tile that starts the engine of ZN-841 on its .zapp (qtfb or the ink session). It checks the catalog's and each app's signature and the SHA-256 before installing. Depends on the engine on the tablet and the hub server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the hub pairs with a server whose URL is set in the app and lists its apps
- [ ] #2 install, update and rollback of an app work on the tablet; each installed app has its own AppLoad tile and launches
- [ ] #3 a tampered or older app is refused with a clear message
- [ ] #4 a T1 test runs the hub against the server of ZN-842 on the Mac (emulator window)
<!-- AC:END -->
