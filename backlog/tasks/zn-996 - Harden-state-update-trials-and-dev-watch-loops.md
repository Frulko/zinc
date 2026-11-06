---
id: ZN-996
title: 'Harden state: update trials and dev watch loops'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-06 07:23'
updated_date: '2026-11-06 07:43'
labels:
  - size-M
  - tools
  - hardening
dependencies: []
ordinal: 755080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/implicit-state-machines.md (#5, #6, M7). Update trial promotion and rollback can validate a broken version or lose the way back. Reproduce first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 App update trial: promoteTrial runs once under a lock; a non-zero exit never promotes; a second launch during a trial does not roll back a healthy run; regression test
- [x] #2 Agent OTA: the previous version is restored before the trial marker is removed; a failed rename keeps the marker; the trial is judged on every launch path; regression test
- [x] #3 zinc doc --serve snapshots the inputs before rebuilding, so a save during a rebuild triggers another one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced before the fix (tests/t1/app_rollback.sh, tests/t1/agent_ota.sh extended): an update that exits with 3 was promoted; a second launch during a trial rolled the running trial back; a failed restoring rename in the agent removed the trial marker.
App trial (src/main.cpp): promoteTrial runs once under a mutex and an atomic flag, writes the zapp that was on trial (not whatever staged says now, a download during the trial stays staged); the trial process holds an flock on apps/<id>/trial.lock until it ends, a second launch that cannot take it runs the version in use and leaves trial and staged alone; a non-zero end (report code, or zinc:sys exit(n) through the new zn::rt::gOnExit hook) leaves trial for the next launch to roll back. No lock on Windows yet (ponytail comment).
Agent OTA (src/agent/ota.cpp): previous.zapp is renamed back before trial is removed; a failed rename keeps the marker and is judged again at the next run. 'Judged on every launch path': the agent starts an app only from op run (server.cpp startApp has one caller; the player runs program.zbc apps, never app.zapp ones), so it already was; nothing to change.
zinc doc --serve (src/doc/doc.cpp): seen is the stamp taken before the rebuild, so a save during it rebuilds again; a new set of inputs is stamped only when the old ones held still. Not reproduced by a test (the window is the rebuild time); tests/t0/doc.sh proves the rebuild still runs.
Tests: app_rollback, app_update_api, agent_ota, doc pass.
<!-- SECTION:NOTES:END -->
