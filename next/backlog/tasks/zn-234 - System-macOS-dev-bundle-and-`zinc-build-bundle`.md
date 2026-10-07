---
id: ZN-234
title: 'System: macOS dev bundle and `zinc build --bundle`'
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
  - ZN-230
  - ZN-231
ordinal: 52040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-05). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc run` of an app with `app.id` and a system import runs from `~/.zinc/cache/macos/devapp/<id>.app` with correct `CFBundleIdentifier` (check via `NSBundle` in selftest) and a valid ad-hoc signature.
- [ ] #2 `zinc build --bundle` writes a launchable `.app` (Info.plist from the manifest, `.icns` from the PNG, URL types, `LSUIElement`), `codesign -v` passes; signing with an identity is a documented command, not run.
- [ ] #3 Refreshing the dev bundle when nothing changed takes under 50 ms.
<!-- AC:END -->
