---
id: ZN-335
title: >-
  Plugins in their own git repositories (subtree split from plugins/), history
  kept
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-08 14:42'
labels:
  - distribution
  - ci
  - size-M
milestone: m-19
dependencies:
  - ZN-331
ordinal: 55260
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: each plugin can live in its own repository and build on its own CI. tools/plugin-split publishes plugins/<name> as a separate repository with `git subtree split` (history kept, deterministic commit ids), a CI job in the main repo pushes the split when plugins/<name> changes, and the engine records which plugin commit each release ships (plugins.lock). The monorepo stays the place where plugins are developed until a plugin moves out for good.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 splitting two plugins twice gives the same commit ids (deterministic), and a change in plugins/<name> produces exactly one new commit in its split
- [ ] #2 a split repository builds alone with the reusable workflow of D-plugin-ci (no path into the engine repo)
- [ ] #3 plugins.lock records name, repository, commit and source hash for every plugin a release ships
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
D37 (owner, 2026-10-08): the split repositories are mirrors in the GitHub organization zinc-engine (plugin-<name>), pushed from the monorepo; a plugin leaves the monorepo for good only after the ABI freeze (ZN-353). Organization setup: ZN-352; community starter: ZN-354.
<!-- SECTION:NOTES:END -->
