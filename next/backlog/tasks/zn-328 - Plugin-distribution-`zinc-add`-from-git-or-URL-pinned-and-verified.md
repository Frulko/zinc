---
id: ZN-328
title: 'Plugin distribution: `zinc add` from git or URL, pinned and verified'
status: Backlog
assignee: []
created_date: '2026-10-08 14:20'
labels:
  - plugins
  - distribution
  - security
  - size-L
milestone: m-19
dependencies: []
ordinal: 55200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today plugins are found locally (the engine's plugins/, the project's, pluginDirs) and their native part is built on demand (ZN-101); there is no way to fetch one. `zinc add <git-url|url|name>[@version]`: fetched into the project or a user cache, version and sha256 pinned in zinc.json (a lock section), signature checked when the source publishes one; optional prebuilt native libraries per target, else the local build. Reuses fetchTool (src/tc) and the update keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc add` from a local git repository and from a file:// archive pins the commit or sha256 in zinc.json; a second machine gets the same bytes
- [ ] #2 a changed archive (sha256 mismatch) or a bad signature is refused
- [ ] #3 a plugin with prebuilt libraries for the target uses them; without, it builds locally as today
<!-- AC:END -->
