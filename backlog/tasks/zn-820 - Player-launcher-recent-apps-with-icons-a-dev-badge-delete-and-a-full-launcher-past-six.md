---
id: ZN-820
title: >-
  Player launcher: recent apps with icons, a dev badge, delete, and a full
  launcher past six
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 07:50'
updated_date: '2026-10-25 08:07'
labels:
  - player
  - ui
  - size-M
milestone: m-13
dependencies: []
ordinal: 529460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: the player's home on a device (image/player) lists the apps sent to it, newest first, each with its icon and name, a DEV band on an app sent by zinc dev, a way to delete one; past six apps a + button opens a launcher page with all of them. The agent keeps what the player needs (name, icon, when sent, dev or deployed).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the home shows the last six apps sent with their icon, newest first; a tap starts one
- [x] #2 an app sent by zinc dev --device carries a DEV band; a deployed one does not
- [x] #3 an app can be deleted from the player (with a confirmation) and is gone from zinc device apps
- [x] #4 past six apps a + button opens a launcher page with all of them
- [x] #5 a T1 test of the player (headless) shows the list from an agent's apps directory
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-25. Agent: apps/<name>/app.json (title, icon from zinc.json app.name/app.icon kept with the app, sent, dev) written at install (src/agent/server.cpp recordApp; a .zapp's icon is copied out, and zinc pack now packs app.icon); a zinc dev --device session's program becomes apps/<name> (or <name>-dev beside a deployed app of that name) with a run.sh, dev: true (src/agent/dev.cpp keepApp; the start message carries the project name). appsJson says dev. Player: services/apps.ts reads the apps, home shows the six newest (icon, name, DEV band) with Edit/Done, a + past six opens pages/apps (the launcher grid, scrolls); delete asks in components/delete-app-dialog.ts and removes the folder and logs, so zinc device apps no longer lists it. A tap writes the folder to $ZINC_RUN/next-app and exits 10; zinc-session starts its app.zapp or run.sh once. Tests: tests/t1/player_launcher.sh (scene texts: six newest + DEV + All apps, launcher with 8, confirmation, apps/hello gone, exit 10 + next-app), agent_apps (app.json + icon of a deploy), agent_dev (kept app with dev:true starts again through run.sh): all pass, with agent_screen, agent_dev_versions, agent, pi_image_player. Not proven on a Pi: the session starting a chosen app (bash -n only).
<!-- SECTION:NOTES:END -->
