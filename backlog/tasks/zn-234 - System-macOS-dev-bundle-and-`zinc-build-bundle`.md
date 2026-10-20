---
id: ZN-234
title: 'System: macOS dev bundle and `zinc build --bundle`'
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 15:43'
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
- [x] #1 `zinc run` of an app with `app.id` and a system import runs from `~/.zinc/cache/macos/devapp/<id>.app` with correct `CFBundleIdentifier` (check via `NSBundle` in selftest) and a valid ad-hoc signature.
- [x] #2 `zinc build --bundle` writes a launchable `.app` (Info.plist from the manifest, `.icns` from the PNG, URL types, `LSUIElement`), `codesign -v` passes; signing with an identity is a documented command, not run.
- [x] #3 Refreshing the dev bundle when nothing changed takes under 50 ms.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. src/tc/bundle.{h,cpp}: infoPlist (id, name, version, LSUIElement, URL types, document types, category, icon), ensureDevBundle (copy of the engine in ~/.zinc/cache/macos/devapp/<id>.app, ad-hoc signature, lsregister, stamp beside the bundle so the seal stays valid; hard links do not survive codesign), writeBundle (sips + iconutil iconset for icon.icns, signature), runningBundleId (CoreFoundation). zinc run re-executes the copy (ZINC_DEVAPP, ZINC_ROOT) when the project has app.id and permissions, not in headless/deterministic runs; ZINC_DEVAPP_SELFTEST prints the bundle id of the running process (CFBundleGetIdentifier) and the refresh time: first creation 69 ms with signing, unchanged 0.1 ms. zinc build --bundle <file> -o X.app links the program into the bundle (macOS; Linux AppDir not written yet), prints the codesign command for a real identity without running it. tests/t1/macos_bundle.sh (macOS only).
<!-- SECTION:NOTES:END -->
