---
id: ZN-243
title: 'System: Deep links, file open, opener/reveal'
status: Review
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:46'
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
- [x] #1 A bundled app registered with `notes://` receives `open notes://x` (cold start through `getCurrent`, warm through `onOpen`); `application:openFiles:` arrives as `drop`/`open-file`.
- [ ] #2 Linux writes the `.desktop` and `xdg-mime` entries (temporary XDG dirs) and forwards the argv URL through single-instance.
- [x] #3 `opener` refuses URLs outside the `scopes.opener.allow` list (test); `reveal` selects the file in Finder (selftest by `NSWorkspace` call log).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. deeplink.ts (current, onOpen, onOpenFile, register) and opener.ts (openUrl, openPath, reveal) over ops deep-link.*/opener.*; opener scope: scopes.opener.allow prefixes/globs checked in the host before the simulator or the system (denied error, [system] denied line); sim goldens tests/golden/system/opener (allowed https and mailto, refused file and http URLs, scripted open-url and open-file events). macOS: kAEGetURL handler on NSAppleEventManager (cold start: current() serves AppKit's queue up to 2 s when launched by launchd, warm: onOpen), open-file event, NSWorkspace openURL and activateFileViewerSelectingURLs; tests/t1/macos_deeplink.sh builds a bundle with urlSchemes under ~/.zinc/cache/macos/devapp and checks cold and warm delivery with a real open. Linux register(): .desktop with MimeType + xdg-mime default under XDG_DATA_HOME, URL from argv in current(): written but not run (no Linux here), AC2 open. application:openFiles: is not hooked into SDL's delegate yet.
<!-- SECTION:NOTES:END -->
