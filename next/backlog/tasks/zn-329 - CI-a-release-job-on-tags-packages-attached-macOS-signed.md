---
id: ZN-329
title: 'CI: a release job on tags (packages attached, macOS signed)'
status: Backlog
assignee: []
created_date: '2026-10-08 14:20'
updated_date: '2026-10-08 14:35'
labels:
  - ci
  - distribution
  - size-S
milestone: m-19
dependencies:
  - ZN-331
ordinal: 55210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
.github/workflows/zinc-next.yml builds and packages on linux-x86_64, linux-aarch64 and macos-arm64 and uploads run artifacts, but nothing makes a release. Add a job on `v*` tags that attaches the packages to a GitHub Release, calls tools/sign-macos with the Developer ID certificate and notarization credentials from secrets, and writes the update manifest. Pushing a tag and adding the secrets are the owner's steps: the task records them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the workflow passes actionlint and a dry run (act or a tag on a fork) shows the release job and its steps
- [ ] #2 without the signing secrets the job still releases unsigned packages and says so
- [ ] #3 the steps the owner must take (secrets names, tag command) are in docs/guide/07-distribution.md
<!-- AC:END -->
