---
id: ZN-247
title: >-
  System: UI kit `MenuBar`, `ContextMenu`, accelerator handling for non-native
  menus
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
  - ZN-236
ordinal: 52170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-18). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The same template renders in the kit when `menu.native` is false, with keyboard navigation, checkmarks, submenus and accelerators; a pixel golden for hero-style light and dark themes.
- [ ] #2 Linux/Pi/sim run of the notes example opens File > New from its accelerator and from a scripted pointer click.
- [ ] #3 When native, the components render nothing (no double menu).
<!-- AC:END -->
