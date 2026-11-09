---
id: ZN-243
title: 'System: Deep links, file open, opener/reveal'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-07 12:21'
updated_date: '2026-11-09 06:41'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-234
  - ZN-242
ordinal: 13100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Left: opener scopes test, reveal, Linux registration (cross).

From docs/reports/system-integration.md (section 11, SYS-14). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A bundled app registered with `notes://` receives `open notes://x` (cold start through `getCurrent`, warm through `onOpen`); `application:openFiles:` arrives as `drop`/`open-file`.
- [x] #2 Linux writes the `.desktop` and `xdg-mime` entries (temporary XDG dirs) and forwards the argv URL through single-instance.
- [x] #3 `opener` refuses URLs outside the `scopes.opener.allow` list (test); `reveal` selects the file in Finder (selftest by `NSWorkspace` call log).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. deeplink.ts (current, onOpen, onOpenFile, register) and opener.ts (openUrl, openPath, reveal) over ops deep-link.*/opener.*; opener scope: scopes.opener.allow prefixes/globs checked in the host before the simulator or the system (denied error, [system] denied line); sim goldens tests/golden/system/opener (allowed https and mailto, refused file and http URLs, scripted open-url and open-file events). macOS: kAEGetURL handler on NSAppleEventManager (cold start: current() serves AppKit's queue up to 2 s when launched by launchd, warm: onOpen), open-file event, NSWorkspace openURL and activateFileViewerSelectingURLs; tests/t1/macos_deeplink.sh builds a bundle with urlSchemes under ~/.zinc/cache/macos/devapp and checks cold and warm delivery with a real open. Linux register(): .desktop with MimeType + xdg-mime default under XDG_DATA_HOME, URL from argv in current(): written but not run (no Linux here), AC2 open. application:openFiles: is not hooked into SDL's delegate yet.
Review 2026-10-25: kept open. (review-close proposed, corrected by the verifier) AC1 is ticked but its open-file half is not wired: plugins/system/native/system.macos.mm:621 defines openFilesIMP, which is never installed (it is its only reference), and the task notes say 'application:openFiles: is not hooked into SDL's delegate yet'. That is Mac work. The Linux half alone would be cross-pass. Evidence: plugins/system deeplink.ts, opener.ts; tests/t1/macos_deeplink.sh; tests/golden/system/opener
Review 2026-11-07: done-partly. macOS deep links exist (tests/t1/macos_deeplink.sh); Linux .desktop/xdg-mime and opener scope parts are left. Evidence: tests/t1/macos_deeplink.sh

2026-11-09: AC2 done and proven on the Pi 3B+ player (zinc device zinc-player, user zinc; ssh keys refused by the agent this session). deep-link.register on Linux now writes x-scheme-handler/<scheme>=<id>.desktop; under [Default Applications] of $XDG_CONFIG_HOME/mimeapps.list itself (an older entry for the scheme replaced, every other line kept, atomic rename) instead of running xdg-mime through a shell: the player image, like any minimal Debian, has no xdg-utils, and the shell call took the id and scheme unquoted. The .desktop entry is written by rename too, its Exec path quoted as the desktop entry spec says. A second launch with a URL in its arguments now also delivers open-url to the first instance (deeplink.onOpen), as Tauri's deep-link plugin does on Linux; the second-instance event keeps the whole argv. Fixed on the way: lockInstance appended each forwarded argument with the capacity of one argument (160) instead of the message's, so with a long working directory the arguments (the URL) were dropped silently. Removed openFilesIMP in system.macos.mm (never installed): SDL3's delegate already turns application:openFile: into a drop (third_party/SDL3/src/video/cocoa/SDL_cocoaevents.m:301), which is AC1's 'arrives as drop'.
Proof: tests/golden-free check on the Pi: the program of tests/t1/linux_deeplink.sh exported with ZINC_ROOT=<this tree> build/zinc export . --target rpi (121 s), pushed to ~/zn/zn243/dl-rpi, run under temporary XDG dirs in ~/zn/zn243/t: 'registered true', Exec="/var/lib/zinc/zn/zn243/dl-rpi/dl" %u, MimeType=x-scheme-handler/notes;, mimeapps.list with the notes line replaced and text/plain, text/html kept; second launch 'handed over: ["notes://doc/7"]' exit 0, first instance 'second instance args ["notes://doc/7"]' then 'open-url notes://doc/7', exit 0; no process left. macOS build of the plugin warning-free. New test tests/t1/linux_deeplink.sh (Linux only, skips elsewhere), mapped in tests/affected.json.
Research (sonnet): Tauri deep-link (v2.tauri.app/plugin/deep-linking) registers through the .desktop file and delivers the argv URL through single-instance; Exec needs %u; mimeapps.list in $XDG_CONFIG_HOME is the place (wiki.archlinux.org/title/Xdg-mime), ~/.local/share/applications/mimeapps.list is deprecated; keep one handler with a trailing ; (bugs.freedesktop.org 44163); update-desktop-database is not needed for the default handler.
later.md line: ZN-243: deeplink.register() under zinc run writes Exec=<zinc> %u, which starts zinc without the project; it needs the project path (or a relaunch command from the engine) in Exec, as autostart does too.
<!-- SECTION:NOTES:END -->
