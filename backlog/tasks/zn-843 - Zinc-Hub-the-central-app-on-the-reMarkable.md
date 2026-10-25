---
id: ZN-843
title: 'Zinc Hub: the central app on the reMarkable'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 19:26'
updated_date: '2026-10-25 20:46'
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
- [x] #1 the hub pairs with a server whose URL is set in the app and lists its apps
- [x] #2 install, update and rollback of an app work on the tablet; each installed app has its own AppLoad tile and launches
- [x] #3 a tampered or older app is refused with a clear message
- [x] #4 a T1 test runs the hub against the server of ZN-842 on the Mac (emulator window)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built app/hub (zinc:ui JSX, e-ink classes, kit Keyboard for URL/code; RemarkableBar). Settings: server URL + pairing code (POST /pair; serverKey+token in ~/.zinc/hub/hub.conf, mode 600). Apps: signed catalog (pinned server key), per-app channel stable/beta, Install / Update (checked at start) / Rollback (only to an older kept package). Install verifies manifest sig with the catalog's app key, manifest==catalog entry, SHA-256; refuses same/older versions; live package ~/zinc-apps/<name>.zapp, previous kept in ~/.zinc/hub/apps/<id>/previous.zapp; then zinc:process runs ~/zinc/bin/zinc-tile <zapp> (absent on a desktop: dry run message). Protocol helpers moved to app/hub-server/src/protocol.ts and shared (zinc pack follows the cross-project import).
Test: tests/run --only hub_app PASS (31 s; pairing incl. a wrong code, install, update announced at start, rollback + forward, beta channel, tampered .zapp, tampered manifest, catalog by another key, older version after retracts; zinc-tile stand-in; the installed .zapp runs; scene texts of the list). hub_server PASS after the refactor.
Decisions: test mode ZINC_HUB_SCRIPT calls the buttons' actions (text entry by ZINC_INPUT is brittle); tile name = package name without version; Rollback swaps with the kept package, Update brings the newer back; hub never downgrades.
AC #2 left for the owner (tablet, read-only checked: /home/root/zinc/bin/zinc-tile and /home/root/zinc-apps exist, Mac is 10.11.99.2 over USB): on the Mac 'zinc run app/hub-server -- --data hub-data' and 'zinc pack app/hub'; scp -O build/hub.zapp root@10.11.99.1:/home/root/zinc-apps/; ssh root@10.11.99.1 /home/root/zinc/bin/zinc-tile /home/root/zinc-apps/hub.zapp; reload AppLoad, open hub, Settings: http://10.11.99.2:8787 + code; publish an app with zinc publish --hub; Install, open its tile, Update, Rollback.
later.md: compiler: 'd.field = f(await x)' with const d fails Z0108 on a temp (__vN), worked around in app/hub/src/services/server.ts; hub: manifest expires/seq anti-freeze (zinc-app-ota-updates.md 5.3) not in the hub protocol; hub: remove an installed app (zinc-tile --remove) from the list; hub: placeholder text of Input is slate grey on e-ink.

Owner test on the tablet (2026-10-25): pair, install, update, rollback, and Open (after e7b2cf82, qtfb-hold keeps the window across the handoff) all work.
<!-- SECTION:NOTES:END -->
