---
id: ZN-851
title: 'zinc:ipod: iPod music database plugin over libgpod'
status: Backlog
assignee: []
created_date: '2026-10-28 21:20'
labels:
  - size-L
  - plugin
milestone: m-9
dependencies: []
ordinal: 560460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plugin zinc:ipod: vendored libgpod (gerion0 fork) with a stb-based gdk-pixbuf shim and the DigiDNA hashab; detect, open or initialise, SysInfoExtended read over USB or synthesised, tracks and playlists, artwork, transfers with free-space checks, snapshots and backup/restore, eject. Research: docs/reports/ipod-library-options-2026-10-28.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Builds on macOS from pkg-config glib/libplist and SDK libxml2/sqlite/zlib; Linux/Pi line in backlog/later.md
- [ ] #2 Headless tests on a fake iPod directory: init, SysInfoExtended created when missing, add track with artwork, playlists, write, re-read, snapshot and restore, space check refusal
- [ ] #3 API uses native records (no \x1e/\x1f strings) and runs on the interpreter, AOT and QuickJS
- [ ] #4 docs/plugins/ipod.md and a sim stand-in
<!-- AC:END -->
