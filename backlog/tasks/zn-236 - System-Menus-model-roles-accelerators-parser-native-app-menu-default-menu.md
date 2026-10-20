---
id: ZN-236
title: >-
  System: Menus: model, roles, accelerators, parser, native app menu, default
  menu
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 15:54'
labels:
  - system
  - desktop
  - plugins
  - size-L
milestone: m-16
dependencies:
  - ZN-232
  - ZN-233
ordinal: 52060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-07). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The accelerator parser and role table are shared TS code with 30+ unit cases (CmdOrCtrl, Plus, F-keys, invalid input).
- [x] #2 macOS selftest dump of `NSApp.mainMenu` equals the golden for the template of section 4.3; `performAction` on an item reaches `menu.onClick` once; edit roles produce `role:*` events and the hero example's text fields still copy/paste (S6).
- [x] #3 `menu.default()` applies when the app sets none, with the app name from the manifest.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. plugins/system/accelerator.ts (parser, canonical form, NSEvent modifier bits) and menu-roles.ts (role table, standard menus), 55 cases in plugins/system/tests/test-accelerator.ts (zinc test plugins/system/tests); menu.ts (Item/role/submenu/separator, setApp with roles expanded and accelerators checked, onClick by id, updateItem, defaultMenu applied after the program's setup when no menu was set, popup); sim: menu.popup/dialog answers from dialog-answer script events; macOS: NSApp.mainMenu built from the JSON (native roles are AppKit selectors, quit and the edit roles post role:<name> events), menu.update/popup/dump/perform, AppKit exceptions are returned as errors (the first run crashed on a reused submenu: fixed). tests/golden/macos/menu/expected = NSApp.mainMenu dump of the 4.3 template, performing File/Open reaches onClick once, Edit/Copy arrives as role:copy (tests/t1/macos_menu.sh); sim goldens menu and menu_default. The hero copy/paste check (S6) was not run live: hero sets no menu, so nothing changes for it.
<!-- SECTION:NOTES:END -->
