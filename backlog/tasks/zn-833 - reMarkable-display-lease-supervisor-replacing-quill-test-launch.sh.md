---
id: ZN-833
title: 'reMarkable: display lease supervisor replacing quill-test launch.sh'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-25 15:09'
labels:
  - remarkable
  - size-M
milestone: m-11
dependencies: []
ordinal: 542460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Option 2 of docs/reports/remarkable-bridge-design.md (§3, §7.1, §8): integrations/remarkable-ink/lease.c (launch / session / restore) as one transient unit per session, replacing examples/remarkable/quill-test/launch.sh and rollback.sh; zinc export --target rmpp writes the AppLoad manifest for "ink": "session". Proven on the Mac with a fake systemd.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lease.c stops xochitl with systemctl stop only, never freezes, kills or masks it, restarts it at most 2 times in 10 min and 6 per hour (budget in /run/zinc-lease/starts) and refuses a launch outside the budget with the reason
- [ ] #2 every way out (app crash, app hang via WatchdogSec, power long press, supervisor stopped, RuntimeMaxSec dead-man) restores xochitl exactly once; reset-failed only after our own clean stop; a wakelock is held while xochitl is stopped
- [ ] #3 tests/native/rmpp/lease-sim (T1): PATH shims for systemctl and systemd-run over a unit state machine with the stock 4/600 s start limit; the scripted sequence ends with xochitl active, no reboot, at most 2 of our starts in any 600 s, every refusal explained
- [ ] #4 quill-test/launch.sh is three lines calling lease, rollback.sh is removed, zinc export --target rmpp points application at lease launch for ink session, docs/targets/remarkable-paper-pro.md has the recovery commands
<!-- AC:END -->
