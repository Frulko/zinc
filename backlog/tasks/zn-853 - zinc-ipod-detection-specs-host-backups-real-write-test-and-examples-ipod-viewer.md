---
id: ZN-853
title: >-
  zinc:ipod: detection, specs, host backups, real write test, and examples/ipod
  viewer
status: Review
assignee: []
created_date: '2026-10-28 22:38'
updated_date: '2026-10-29 00:03'
labels:
  - size-L
  - plugin
milestone: m-9
dependencies: []
ordinal: 562460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-28: better detection and backups, the write test on the real iPod (backup first), and a small demo app showing the iPod, its music with artwork and every detail of the iPod.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 detect() also lists iPods connected over USB that are not mounted, with their model from the USB description
- [x] #2 specs(): every field of SysInfoExtended and the database (firmware, serial, GUID, artwork formats, capabilities, counts, storage use) as groups of name and value
- [x] #3 Before the first change of a session, the database is copied to the computer (ZINC_HOME/ipod/<serial>/), the last ten kept; backup() copies music incrementally and backups() lists them
- [ ] #4 Write test on the owner's iPod after a host backup: add a track to a test playlist, read it back, restore; recorded in the notes
- [x] #5 examples/ipod: the iPod's info and specs, albums with their covers, tracks of an album, playlists; follows examples/GUIDELINES.md; runs on the fake iPod in a test
- [x] #6 examples/ipod also shows the podcasts, audiobooks, videos, photos (zinc:ipod photoAlbums/photo) and the notes, contacts, calendars and recordings (extras) of the iPod (owner 2026-10-29)
- [x] #7 examples/ipod plays a track from the iPod, iTunes-like: double-click, play/pause, previous/next, progress with seek; zinc:audio streams a file (openMusic) and reads AAC/ALAC on macOS (owner 2026-10-29)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-29: #1-#3 proven by tests/t0/ipod.sh and tests/t1/ipod_plugin.sh; #5-#7 by tests/t1/ipod_demo.sh (11 pages: overview, albums, album, search, sort, playlists with a track playing, specs, dark, podcasts, a note, photos) and tests/t1/audio_music.sh (WAV and AAC: open, play, pause, seek, end, again). On the real iPod (read only): 2501 songs and 46 podcasts, a 57 min AAC podcast streams with sound, 12 photos read (the RGB screen size: the TV-out I420 size reads as stripes in libgpod), 1 note.
Engine gaps fixed on the way: a newline in a <Text> drew '?' (lib/std/ui.ts wrapText and wrapRuns, src/host/text_wrap.cpp; tests/t1/ui_text_newline.sh on three engines, layout_yoga case); zinc:audio could not play AAC/ALAC nor stream a long file (Music: decode thread, 2 s ring, AudioToolbox on Apple, miniaudio elsewhere).
#4: the track was added and read back on the owner's iPod after the host backup ~/.zinc/ipod/2Z8460HU9ZU/20261029-000325 (run by the owner); the restore waits for the owner: cd $TMPDIR/realtest && ./realtest restore "/Volumes/IPOD DE LAL" 20261029-000325, then compare the md5s of ~/.zinc/ipod-safety/20261028-235933/md5.txt.
<!-- SECTION:NOTES:END -->
