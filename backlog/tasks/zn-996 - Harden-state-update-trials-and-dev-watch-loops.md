---
id: ZN-996
title: 'Harden state: update trials and dev watch loops'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 07:23'
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
- [ ] #1 App update trial: promoteTrial runs once under a lock; a non-zero exit never promotes; a second launch during a trial does not roll back a healthy run; regression test
- [ ] #2 Agent OTA: the previous version is restored before the trial marker is removed; a failed rename keeps the marker; the trial is judged on every launch path; regression test
- [ ] #3 zinc doc --serve snapshots the inputs before rebuilding, so a save during a rebuild triggers another one
<!-- AC:END -->
