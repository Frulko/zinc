---
id: ZN-435
title: 'zinc.json keys assets, splash, loading, launcher and target defaults'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parse and validate assets (object form: dir, rules, groups, profiles, budgets), splash, loading, launcher and targets.<id>.assets. Add an assets entry per target in targets/capabilities.json (formats, max size, POT, codecs, pack codec, budgets). Report: docs/reports/games/toolchain-assets-loading.md (3, 10).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 parseProject tests cover each key and each error
- [ ] #2 zinc assets info prints the effective profile per target
- [ ] #3 projects without the keys produce byte-identical outputs to before
<!-- AC:END -->
