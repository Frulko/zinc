---
id: ZN-853
title: >-
  zinc:ipod: detection, specs, host backups, real write test, and examples/ipod
  viewer
status: In Progress
assignee: []
created_date: '2026-10-28 22:38'
updated_date: '2026-10-29 00:38'
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
- [x] #8 Every page of examples/ipod scrolls when its content is taller than the window (the overview cut at the bottom on a 1000 px window), through an engine-level means a page gets almost for free (e.g. Tailwind's overflow-auto on a View), not per-page workarounds (owner 2026-10-29)
- [x] #9 Download: an album, a playlist, the podcasts or chosen songs are copied from the iPod to a folder of the computer, named Artist/Album/NN Title.ext from the tags, with progress; files already there are skipped (owner 2026-10-29)
- [x] #10 Add: files or a folder (a file picker and drag and drop) are added as music, podcasts, audiobooks or videos, with progress, the space check and a result per file (owner 2026-10-29)
- [x] #11 Backups page: list, take (with or without the music), restore with a confirmation, delete; every write is behind an Allow changes switch, off by default, and the automatic backup runs before the first change (owner 2026-10-29)
- [x] #12 A transfers panel (the queue of adds, downloads, backups and restores with progress) and a Logs page (every operation with its time and result, also appended to a file) (owner 2026-10-29)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-29: #1-#3 proven by tests/t0/ipod.sh and tests/t1/ipod_plugin.sh; #5-#7 by tests/t1/ipod_demo.sh (11 pages: overview, albums, album, search, sort, playlists with a track playing, specs, dark, podcasts, a note, photos) and tests/t1/audio_music.sh (WAV and AAC: open, play, pause, seek, end, again). On the real iPod (read only): 2501 songs and 46 podcasts, a 57 min AAC podcast streams with sound, 12 photos read (the RGB screen size: the TV-out I420 size reads as stripes in libgpod), 1 note.
Engine gaps fixed on the way: a newline in a <Text> drew '?' (lib/std/ui.ts wrapText and wrapRuns, src/host/text_wrap.cpp; tests/t1/ui_text_newline.sh on three engines, layout_yoga case); zinc:audio could not play AAC/ALAC nor stream a long file (Music: decode thread, 2 s ring, AudioToolbox on Apple, miniaudio elsewhere).
#4: the track was added and read back on the owner's iPod after the host backup ~/.zinc/ipod/2Z8460HU9ZU/20261029-000325 (run by the owner); the restore waits for the owner: cd $TMPDIR/realtest && ./realtest restore "/Volumes/IPOD DE LAL" 20261029-000325, then compare the md5s of ~/.zinc/ipod-safety/20261028-235933/md5.txt.

2026-10-29 (#8-#12, and the owner's live mount/unmount request): proven by tests/t1/ipod_demo.sh (15 frames: the 11 pages, then Backups with the health checked, Add after two files dropped on the window (new-song.wav added, track.flac refused), Transfers (download of an album, the add, the check), Logs; the album on disk as Artist/Album/NN Title.ext; the log file's lines; the disk image detached while the app runs, the app logs 'Zinc Pod disconnected', attached again, it reopens it by itself; QuickJS overview; idle paints nothing though detect() polls every 3 s) and tests/t0/ipod.sh (download names, skip of same-size files, an unknown id, safeName, deleteBackup refusing outside the backup place / an iPod folder / the root / '..', mount refusing a bad disk name). #8: zinc:ui already had overflow-y-auto (a box that scrolls only when it overflows); the pages were already ScrollViews or VirtualLists and the overview scrolls (scripted wheel at 1180x500, scale 1 and 2); the sidebar now scrolls (overflow-y-auto above Rescan). The owner's cut overview did not reproduce headless: to try in a real window. Engine gap fixed on the way: an app's own Button imported from components/ was taken for the host Button (src/frontend/jsx.cpp jsxHostTag; tests/t0/jsx.sh own_button on interp, QuickJS and AOT). To try by hand (needs a real window): the file and folder pickers, a drop of files and of a folder from the Finder, the Change... folder picker, Restore/Delete confirmations (NSAlert), Mount of a USB-only iPod (diskutil mountDisk on disks whose media name says iPod: unproven on hardware), Eject.
<!-- SECTION:NOTES:END -->
