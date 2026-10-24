---
id: ZN-484
title: 'CI job: handheld emulator matrix'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - ci
  - handheld
  - handhelds
  - size-M
milestone: m-23
dependencies:
  - ZN-463
  - ZN-464
  - ZN-465
ordinal: 267000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A GitHub Actions job (Linux, Xvfb) that builds the cores with the pinned toolchains and runs hello and bouncing-ball goldens in PPSSPPHeadless, Azahar (RetroArch core) and Vita3K where firmware can be provided by a secret-free method (else Vita stays local).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the job runs on push and fails on a golden mismatch
- [ ] #2 toolchain and emulator downloads are cached and pinned
- [ ] #3 Vita's firmware requirement is handled without committing Sony files
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: dropped. The owner decided CI runs only on a release and the console emulator tests skip on hosted runners (6c106b66); a Linux CI matrix is a later.md line already. Evidence: tests/t2/console_emulators.sh skips under ZINC_CI; backlog/later.md:910 Verifier: console_emulators.sh skips under ZINC_CI (line 12), CI runs only on releases (AGENTS.md), and the Linux console-runner CI is already a later.md line (ZN-457, later.md ~907).
<!-- SECTION:NOTES:END -->
