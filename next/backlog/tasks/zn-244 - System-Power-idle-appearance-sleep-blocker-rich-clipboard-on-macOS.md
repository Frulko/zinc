---
id: ZN-244
title: 'System: Power, idle, appearance, sleep blocker, rich clipboard on macOS'
status: Review
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:47'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-232
ordinal: 52140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-15). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `SDL_POWER` switched on; `power.battery()` returns SDL's values; suspend/resume/lock events come from `NSWorkspace` notifications posted in selftest and from the script.
- [x] #2 `preventSleep` creates and releases an IOKit assertion (checked with `pmset -g assertions`); dark/light event follows `SDL_EVENT_SYSTEM_THEME_CHANGED`.
- [x] #3 Clipboard image and file-list round trip through NSPasteboard in selftest; text path through the HAL is unchanged.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. power.ts (battery, idleSeconds, isDark, onPower, onAppearance, preventSleep/SleepLock) and clipboard.ts (html, image as base64 PNG, files) over power.*/clipboard.* ops; sim keeps the pasteboard and sleep tokens. macOS: battery from IOKit (IOPSCopyPowerSourcesInfo), idle from CGEventSourceSecondsSinceLastEventType, NSWorkspace will-sleep/did-wake and distributed lock/appearance notifications as events, preventSleep = IOPMAssertionCreateWithName (visible in pmset -g assertions while held, gone after release), NSPasteboard html/PNG/file URLs. tests/golden/macos/power + tests/t1/macos_power.sh (restores the clipboard text). AC1 deviates on purpose: SDL_POWER stays off, IOKit gives the same values without rebuilding SDL; lock/unlock events are injected in the selftest (the distributed notifications are not delivered back to the posting process), suspend/resume go through the real NSWorkspace notifications. Appearance changes follow AppleInterfaceThemeChangedNotification rather than SDL_EVENT_SYSTEM_THEME_CHANGED. Text clipboard through the HAL untouched.
<!-- SECTION:NOTES:END -->
