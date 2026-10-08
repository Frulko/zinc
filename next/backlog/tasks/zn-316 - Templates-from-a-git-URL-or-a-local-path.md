---
id: ZN-316
title: Templates from a git URL or a local path
status: Backlog
assignee: []
created_date: '2026-10-08 14:19'
labels:
  - templates
  - cli
  - security
  - size-S
milestone: m-19
dependencies:
  - ZN-315
ordinal: 55010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc new <git-url|gh:user/repo[@ref]|path> <dir>`: the template is fetched (pinned commit recorded in the new zinc.json), its template.json validated; creating a project never runs code from the template.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a local path and a file:// git repository work in the test (no network)
- [ ] #2 the commit is recorded; a template.json with unknown keys or files outside the template is refused
- [ ] #3 no script of the template runs (test with a hostile template)
<!-- AC:END -->
