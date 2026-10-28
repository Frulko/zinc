---
id: ZN-851
title: 'zinc:ipod: iPod music database plugin over libgpod'
status: Done
assignee: []
created_date: '2026-10-28 21:20'
updated_date: '2026-10-28 22:30'
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
- [x] #1 Builds on macOS from pkg-config glib/libplist and SDK libxml2/sqlite/zlib; Linux/Pi line in backlog/later.md
- [x] #2 Headless tests on a fake iPod directory: init, SysInfoExtended created when missing, add track with artwork, playlists, write, re-read, snapshot and restore, space check refusal
- [x] #3 API uses native records (no \x1e/\x1f strings) and runs on the interpreter, AOT and QuickJS
- [x] #4 docs/plugins/ipod.md and a sim stand-in
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-28. tests/t0/ipod.sh (the core on a fake iPod: init, SysInfoExtended built with libgpod's artwork formats (without them libgpod silently writes no cover), tagged WAV with embedded PNG cover, FLAC and junk refused, space refusal before any copy, playlists, saveArtwork, snapshot and restore, check/repair, backup/restore) and tests/t1/ipod_plugin.sh (tests/data/ipod-app on the interpreter, QuickJS and AOT, same lines). Real iPod Classic 7G (xC297, FAT32), read-only: SysInfoExtended read over USB (vendor request 0x40) while mounted, detect, 2546 tracks and 6 playlists parsed, check found 9 orphan files (338 MB, likely left by iOpenPod); iTunesDB md5 unchanged. Writes on a real iPod not tried yet (owner's consent, backup first). Engine fixes found on the way: a77703de. Linux/Pi and Windows: backlog/later.md, Cross-platform pass.
<!-- SECTION:NOTES:END -->
