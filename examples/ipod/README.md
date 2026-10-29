# iPod

A viewer and manager for a classic iPod (Classic, Nano, Mini, Video, Shuffle) on `zinc:ipod`: plug one in and see the device drawn
in its colour, how its disk is used by kind of media, its albums with their covers, every song (search and sort), its
playlists, and every detail the iPod and its database give (model, serial, firmware, storage, library, artwork formats and
every key of SysInfoExtended). It plays the music, downloads albums, playlists, podcasts or chosen songs to the computer, adds
files and folders, keeps backups, and shows a queue of transfers and a log. Nothing is written to the iPod until **Allow
changes** (in the sidebar, off at every start) is turned on.

```sh
zinc run examples/ipod                                  # finds the iPods plugged in
IPOD_DEMO_MOUNT=/Volumes/MYPOD zinc run examples/ipod   # shows only the iPod mounted there
```

The plugin needs a few system libraries (`brew install glib libplist taglib libusb`, see [docs/plugins/ipod.md](../../docs/plugins/ipod.md)).

- **Finding an iPod.** `ipod.detect()` runs at start and every three seconds while no iPod is shown (Rescan in the sidebar looks
  at once). One mounted iPod is opened by itself; with several, pick one. An iPod plugged in but not mounted is shown with what
  USB tells (model, serial, firmware) and a note to put it in disk mode.
- **Covers.** Each album's cover is read from the iPod (`ipod.cover`, at twice its size on screen) when its row of the grid comes
  on screen, cached by album while shown and freed with `destroyImage` when the row is dropped.
- **Long lists.** The album grid and every track table are `VirtualList`s: 2,500 songs cost the rows on screen.
- **Plugged in, pulled out.** `detect()` runs every three seconds: an iPod mounted shows at once (and opens when it is the only
  one); the open iPod unmounted, ejected elsewhere or pulled stops the playback and the jobs not started, is closed and the
  Devices page says so. One seen on USB but not mounted has a **Mount** button (`ipod.mount`, nothing is written); **Eject** (on
  the Backups page) stops the playback and ejects it. Nothing is redrawn while the list does not change.
- **Download.** Album, playlist, all podcasts (or songs), the selected rows (click, Cmd-click, Shift-click) or one row's arrow:
  copied to `~/Music/iPod/<iPod name>` (Change… on the Transfers page picks another folder) as `Artist/Album/NN Title.ext`;
  files already there with the same size are skipped. It only reads the iPod.
- **Add.** On the Add page choose Music, Podcast, Audiobook or Video and a playlist, then Choose files…, Choose a folder… or drop
  files and folders on the window. The space is checked first; each file gets its result (refused format, not audio).
- **Backups.** The backups of this iPod on the computer (automatic ones are taken by `zinc:ipod` before the first change of a
  session), Back up now (with or without the music), Restore and Delete after a question; Check and Repair, Eject.
- **Optimise.** Analyse (it only reads the iPod) finds the duplicates by their tags (title, artist, album, length within 2 s), by
  identical files and by their sound (Chromaprint fingerprints, cached on the computer), the songs without a cover or tags, the
  files no track uses and the empty playlists. Each group says why it matched and keeps the most complete copy (lossless, bitrate,
  sample rate, tags, cover, numbers, year; a click on another copy keeps that one); Merge selected (Allow changes, a question)
  gives the kept copy the tags, cover, plays, rating and playlist places of the others and removes them with their files.
- **Transfers and logs.** Every download, add, backup, restore, delete and repair is a job of one queue (one at a time, progress
  from `ipod.onProgress`, Cancel before it starts; the sidebar shows how many and a bar). Every operation is on the Logs page and
  appended to `~/.zinc/ipod/logs/demo.log` (beside the backups).
- **Light and dark** follow the system (`"scheme": "auto"`).

## Layout of `src/`

```text
src/
├── main.tsx              # mounts the app, routes the pages, closes the iPod on SIGINT/SIGTERM
├── constants.ts          # colours (light and dark schemes), the iPods' colours, sizes, timings, page names
├── format.ts             # durations, sizes, counts
├── state.ts              # iPods found (watched), the open one's library, albums, search, sort, selection, Allow changes
├── actions.ts            # what copies or changes: download, add, backup, restore, delete, check, repair, mount, eject
├── optimise.ts           # the analysis, the duplicate groups ticked and kept, the merge
├── services/ipod.ts      # zinc:ipod reads: detect, open and read (again after a change), close
├── services/covers.ts    # covers by album, read when shown, freed when dropped
├── services/player.ts    # playing from the iPod
├── services/transfers.ts # the queue of jobs, one at a time, with their progress
├── services/log.ts       # the operations, on the Logs page and in the log file
├── components/           # Sidebar, AllowChanges, Button, PodDrawing, StorageBar, AlbumCover, TrackTable, NowPlaying
└── pages/                # devices, overview, albums, songs, playlists, photos, files, specs, add, backups, optimise, transfers, logs
```

## Test

`tests/t1/ipod_demo.sh` makes a fake iPod on a 128 MB disk image, fills it with nine tracks in three albums (two with covers),
a podcast, a playlist and three duplicates, then drives the app headless through every page (and the albums again in the dark scheme), compares one
frame hash per page, checks the overview on QuickJS and that nothing is painted while the app is left alone; then it checks the
iPod's health, drops two files on the window, downloads an album, shows the transfers and the log, analyses the iPod on the Optimise page and merges its duplicates, and unmounts and mounts the
disk image while the app runs (it closes the iPod, then opens it again).
