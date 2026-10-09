---
id: ZN-393
title: 'Installers checked in a Linux container: dpkg -i of the .deb, the AppImage run'
status: Backlog
assignee: []
created_date: '2026-10-09 00:07'
labels:
  - distribution
  - parked
  - size-S
dependencies:
  - ZN-320.01
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-320.01 (and ZN-320.03): the .deb is written and read back on macOS without dpkg; installing it (dpkg -i, then dpkg -L lists the files, the launcher runs) and running the AppImage need a Linux machine or container. Parked with the other Linux-only runs (ZN-054 family) until such a runner exists in the CI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 in the Linux CI job: dpkg -i of the exported .deb succeeds, dpkg -L lists /opt/<name>/<name> and /usr/bin/<name>, and /usr/bin/<name> prints the app's output
<!-- AC:END -->
