---
id: ZN-352
title: 'GitHub organization zinc-engine: repository layout and setup script'
status: Backlog
assignee: []
created_date: '2026-10-08 14:42'
labels:
  - distribution
  - ci
  - size-S
milestone: m-19
dependencies:
  - ZN-335
ordinal: 55400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D37 (owner, 2026-10-08). tools/gh-org-setup creates, in the organization zinc-engine, the repositories: zinc (the engine), plugin-<name> per official plugin (mirrors of plugins/<name> pushed by ZN-335's split), index (signed index, ZN-336), plugin-starter (ZN-354) and templates. Settings: branch protection, the release secrets' names, the reusable plugin workflow. Creating the organization and running the script against GitHub are the owner's steps: the script has --dry-run, prints every gh command, and the task records them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `tools/gh-org-setup --dry-run` lists every repository and setting it would create, with the gh commands
- [ ] #2 running it twice changes nothing the second time (idempotent, checked against a fake gh in the test)
- [ ] #3 docs/guide/07-distribution.md says which repository holds what
<!-- AC:END -->
