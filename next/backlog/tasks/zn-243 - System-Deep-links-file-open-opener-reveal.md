---
id: ZN-243
title: 'System: Deep links, file open, opener/reveal'
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-234
  - ZN-242
ordinal: 52130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-14). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A bundled app registered with `notes://` receives `open notes://x` (cold start through `getCurrent`, warm through `onOpen`); `application:openFiles:` arrives as `drop`/`open-file`.
- [ ] #2 Linux writes the `.desktop` and `xdg-mime` entries (temporary XDG dirs) and forwards the argv URL through single-instance.
- [ ] #3 `opener` refuses URLs outside the `scopes.opener.allow` list (test); `reveal` selects the file in Finder (selftest by `NSWorkspace` call log).
<!-- AC:END -->
