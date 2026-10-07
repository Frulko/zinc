---
id: ZN-238
title: 'System: Tray on macOS'
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:19'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-232
  - ZN-234
ordinal: 52080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-09). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create/update/destroy with template image, title, tooltip, menu, `menuOnLeftClick`; selftest shows `isTemplate == true`, the image size and the menu tree.
- [x] #2 Click, double-click, right-click events with bounds arrive from a real `performClick:` and from the script.
- [x] #3 `screencapture` of the status item region exists as a reference image; `LSUIElement` tray-only app starts without a dock icon.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. plugins/system/tray.ts (Options, Tray with onClick/setTitle/setTooltip/setIcon/setMenu/destroy, create, isAvailable); ops tray.create/update/remove/available + test hooks tray.dump/tray.click; macOS NSStatusItem (template image or a drawn dot, title, tooltip, menu, menuOnLeftClick), clicks arrive as tray-click [button, double, id], menu items report source 'tray'. Selftest tests/golden/macos/tray (tests/t1/macos_tray.sh): template true, image 18x18, title, tooltip, the menu tree, a real performClick and a right click, update, destroy. Reference screenshot tests/golden/macos/tray/statusitem.png: the item on the menu bar (it lands on the display whose menu bar is active, here the left 4K one). An LSUIElement app has ApplicationType UIElement (no dock icon). Bugs found on the way and fixed: AppKit needs its events served in a program with no window of its own (pump from the poller, which also keeps the loop turning every 5 ms; status item windows do not count as app windows), NSApplication policy and finishLaunching (ensureApp), macOS adds items to the Edit and View menus (the dump keeps what the app declared), the default menu is only applied when the menu permission is granted. Menu, dock and tray selftests pass; system_manifest updated (tray is now a real module).
<!-- SECTION:NOTES:END -->
