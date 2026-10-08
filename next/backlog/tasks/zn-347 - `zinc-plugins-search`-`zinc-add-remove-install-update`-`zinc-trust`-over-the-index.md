---
id: ZN-347
title: >-
  `zinc plugins search`, `zinc add/remove/install/update`, `zinc trust` over the
  index
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - cli
  - size-M
milestone: m-19
dependencies:
  - ZN-336
  - ZN-337
  - ZN-344
  - ZN-328
ordinal: 55380
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user-facing commands on top of the index (ZN-328 covers git and URL sources): search, add a plugin or template by name and version range, remove, install from the lock, update within ranges, trust a publisher key. Output follows the CLI conventions (quiet on success, one line per item).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 end-to-end test against a local index: search, add, install on a clean machine, update, remove
- [ ] #2 `zinc help` documents each command
- [ ] #3 errors name the plugin, the version and the reason (signature, policy, capability, revoked)
<!-- AC:END -->
