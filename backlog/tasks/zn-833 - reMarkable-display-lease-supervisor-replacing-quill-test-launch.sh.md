---
id: ZN-833
title: 'reMarkable: display lease supervisor replacing quill-test launch.sh'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 15:09'
updated_date: '2026-10-25 15:32'
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
- [x] #1 lease.c stops xochitl with systemctl stop only, never freezes, kills or masks it, restarts it at most 2 times in 10 min and 6 per hour (budget in /run/zinc-lease/starts) and refuses a launch outside the budget with the reason
- [x] #2 every way out (app crash, app hang via WatchdogSec, power long press, supervisor stopped, RuntimeMaxSec dead-man) restores xochitl exactly once; reset-failed only after our own clean stop; a wakelock is held while xochitl is stopped
- [x] #3 tests/native/rmpp/lease-sim (T1): PATH shims for systemctl and systemd-run over a unit state machine with the stock 4/600 s start limit; the scripted sequence ends with xochitl active, no reboot, at most 2 of our starts in any 600 s, every refusal explained
- [x] #4 quill-test/launch.sh is three lines calling lease, rollback.sh is removed, zinc export --target rmpp points application at lease launch for ink session, docs/targets/remarkable-paper-pro.md has the recovery commands
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
lease.c (launch/session/restore/status) replaces quill-test launch.sh's body; rollback.sh removed. tests/run --only rmpp_lease: lease-sim 9 leases (quit, crash, watchdog hang, power long press, systemctl stop zinc-lease, supervisor SIGKILL, RuntimeMaxSec dead-man, xochitl stop timeout with stale lock, failed start with systemd's own restart), 6 refusals each with its reason (active <30 s, 60 s gap, 2/10 min, 6/hour, lease already running, NRestarts moved); ends with xochitl active, no reboot, worst 2 of our starts per 600 s, reset-failed 8 times for 8 clean stops, wakelock released; mutation (2/10 min limit raised to 3) makes it fail. export manifest: session -> application lease, args [launch --watchdog 10 <app>], qtfb false; otherwise qtfb true; icon.png and deploy.sh also written (they were missing since the prototype's removal). Choices: application = lease directly for ink session (AC #4), not the app re-exec of design §7; --watchdog 10 assumes the app sends WATCHDOG=1 per frame (ZN-835 native.h). Not provable on the Mac: real systemd/systemd-run, the power key device (EVIOCGRAB), the zig aarch64-musl lease build, the tablet test plan T5/T6. Five-finger escape is left to the app.
<!-- SECTION:NOTES:END -->
