---
id: ZN-335
title: >-
  Plugins in their own git repositories (subtree split from plugins/), history
  kept
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 04:16'
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
- [x] #1 splitting two plugins twice gives the same commit ids (deterministic), and a change in plugins/<name> produces exactly one new commit in its split
- [ ] #2 a split repository builds alone with the reusable workflow of D-plugin-ci (no path into the engine repo)
- [x] #3 plugins.lock records name, repository, commit and source hash for every plugin a release ships
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
tools/plugin-split (git subtree split, bundled with git): '<name>...' prints and keeps plugin/<name>, '--lock [file]' writes plugins.lock (format, engine commit, per plugin name, repository $ZINC_PLUGIN_REPO_BASE/plugin-<name>.git, split commit, source git-tree id), '--push' pushes to the mirror. Measured on this repo (916 commits): 28 s per plugin; device and gestures split twice give df382cb6 / e7c736e3 both times. tests/t1/plugin_split.sh (synthetic monorepo): same ids twice, history kept, plugin at the root, no engine files, a change in plugins/a = exactly one new commit whose parent is the old split, b unchanged, plugins.lock fields. CI: plugin-mirrors job on main (secret PLUGIN_MIRROR_TOKEN; without it only splits), the release job attaches plugins.lock (33 plugins, about 15 min of splits). AC 2 needs ZN-338's reusable workflow: ZN-335.01. Creating zinc-engine and the token is the owner's step (ZN-352). usage: n/a
<!-- SECTION:NOTES:END -->
