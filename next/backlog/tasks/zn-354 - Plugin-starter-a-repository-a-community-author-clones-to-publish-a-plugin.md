---
id: ZN-354
title: 'Plugin starter: a repository a community author clones to publish a plugin'
status: Backlog
assignee: []
created_date: '2026-10-08 14:42'
labels:
  - plugins
  - templates
  - size-S
milestone: m-19
dependencies:
  - ZN-338
ordinal: 55420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A plugin starter (plugin.json, a Zinc API, an optional native part, tests, README, the reusable CI of ZN-338 wired, a signing key how-to) that `zinc new plugin <dir>` also creates; it builds, tests and packages alone, outside the engine repository.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc new plugin` creates it and `zinc plugins` in a project that adds it lists it
- [ ] #2 its CI runs the 4-target matrix with the reusable workflow and produces the artifacts the index expects
- [ ] #3 the README walks from new to a published, signed release
<!-- AC:END -->
