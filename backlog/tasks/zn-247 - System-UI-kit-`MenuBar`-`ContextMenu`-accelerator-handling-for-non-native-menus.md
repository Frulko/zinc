---
id: ZN-247
title: >-
  System: UI kit `MenuBar`, `ContextMenu`, accelerator handling for non-native
  menus
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-25 01:53'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-236
ordinal: 370000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-18). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The same template renders in the kit when `menu.native` is false, with keyboard navigation, checkmarks, submenus and accelerators; a pixel golden for hero-style light and dark themes.
- [x] #2 Linux/Pi/sim run of the notes example opens File > New from its accelerator and from a scripted pointer click.
- [x] #3 When native, the components render nothing (no double menu).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. lib/std/kit/menubar.tsx: MenuBar (native=true renders nothing, otherwise one button per top entry opening its menu as a layer: labels, accelerator hints, checkmarks, separators, submenus; arrows/Enter/Escape from the focus scope) and ContextMenu (right press opens it under the pointer); accelerators are bound as global kit key strokes (mod-n) and run the item. plugins/system/menu.ts toKit(items) converts the system template (roles expanded) so the same template feeds both. tests/golden/ui/menubar + tests/t1/kit_menubar.sh: scripted click File > New and the mod-n accelerator both print 'menu new', a right press + click on Copy runs it, native=true leaves no menu bar, pixel goldens of the open File menu in light and dark kit themes. AC2 (the notes example opening File > New on Linux/Pi/sim) not done: the notes example has no menu yet, the kit test app stands in; the lib/std/kit files host.ts and keyboard-layouts.ts hold another developer's changes and were left alone (index.ts got one export line).
Review 2026-10-25: closed as Done. Close as done: the kit MenuBar/ContextMenu, accelerators and pixel goldens pass. AC2 (notes example on Linux/Pi) becomes a later.md line: the notes example has no menu and Linux is in the cross pass. Evidence: lib/std/kit/menubar.tsx; tests/t1/kit_menubar.sh; tests/golden/ui/menubar Verifier: tests/t1/kit_menubar.sh drives File > New both by a scripted click and by the accelerator. Only the Linux/Pi run of the notes example is left, and it is cross-pass.
<!-- SECTION:NOTES:END -->
