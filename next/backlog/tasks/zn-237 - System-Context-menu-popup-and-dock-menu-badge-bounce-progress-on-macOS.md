---
id: ZN-237
title: 'System: Context menu popup and dock menu/badge/bounce/progress on macOS'
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 15:56'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-236
ordinal: 52070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-08). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `menu.popup` resolves with the id from the script in the sim and from `performAction` in selftest; frames keep running or the stall is measured and recorded (S7).
- [x] #2 Dock badge readback equals the set string; dock menu items fire `menu` events with `source: 'dock'`.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. menu.popup was done with ZN-236 (sim: answer from dialog-answer, macOS: NSMenu popUpMenuPositioningItem, perform in selftest); S7: the popup tracks in AppKit's modal tracking mode, so frames of the app stall while it is open (not measurable unattended: a menu waits for a click). Dock: plugins/system/dock.ts (setBadge, getBadge, bounce, setProgress, setMenu) over ops dock.*, sim state for the badge; macOS: NSApp.dockTile.badgeLabel, requestUserAttention, a dock tile view with a progress bar, the dock menu through applicationDockMenu: added with class_addMethod to the delegate's class (an own delegate when there is none: SDL's is untouched). Items fire menu-click with source 'dock'. Goldens: sim dock, macOS tests/golden/macos/dock (badge readback '7', dock item performed -> source dock; tests/t1/macos_dock.sh).
<!-- SECTION:NOTES:END -->
