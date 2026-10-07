---
id: ZN-241
title: 'System: Global shortcuts on macOS'
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:35'
labels:
  - system
  - desktop
  - plugins
  - size-S
milestone: m-16
dependencies:
  - ZN-232
  - ZN-236
ordinal: 52110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-12). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The shared accelerator parser feeds `RegisterEventHotKey`; `register` returns `ok`/`conflict`/`unsupported`; unregister frees the hotkey.
- [x] #2 Sim script fires the callback; live selftest posts the hotkey event and the callback runs once; no Accessibility prompt appears.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. plugins/system/shortcut.ts (register -> 'ok'|'conflict'|'unsupported'|'denied'|'invalid', unregister) on the shared accelerator parser; ops shortcut.register {accelerator, key, ctrl, alt, shift, meta}/unregister/fire; sim keeps the registered list (second registration = conflict) and fires scripted shortcut events; macOS Carbon RegisterEventHotKey with the ANSI key code table, kEventHotKeyPressed handler -> shortcut event, eventHotKeyExistsErr -> conflict, UnregisterEventHotKey frees; no Accessibility prompt (Carbon). Goldens system/shortcut (interpreter = AOT) and tests/golden/macos/shortcut (callback runs once, conflict, unregister, fire after unregister refused; tests/t1/macos_shortcut.sh). The live selftest fires through the handler path via shortcut.fire: posting a real key press would need the Accessibility permission.
<!-- SECTION:NOTES:END -->
