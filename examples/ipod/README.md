# iPod

A viewer and manager for a classic iPod (Classic, Nano, Mini, Video, Shuffle) on `zinc:ipod`: plug one in and see the device drawn
in its colour, how its disk is used by kind of media, its albums with their covers, every song (search and sort), its
playlists, and every detail the iPod and its database give (model, serial, firmware, storage, library, artwork formats and
every key of SysInfoExtended). It plays the music, downloads albums, playlists, podcasts or chosen songs to the computer, adds
files and folders, keeps backups, and shows a queue of transfers and a log. It also drives an iPod plugged into another computer
that runs the iPod daemon (`examples/ipod-web`). Nothing is written to the iPod until **Allow
changes** (in the sidebar, off at every start) is turned on.

```sh
zinc run examples/ipod                                  # finds the iPods plugged in
IPOD_DEMO_MOUNT=/Volumes/MYPOD zinc run examples/ipod   # shows only the iPod mounted there
IPOD_DEMO_REMOTE=http://pi.local:8686 IPOD_DEMO_REMOTE_TOKEN=T zinc run examples/ipod   # connects to that iPod daemon at start
```

The plugin needs a few system libraries (`brew install glib libplist taglib libusb`, see [docs/plugins/ipod.md](../../docs/plugins/ipod.md)).

- **A remote iPod.** "Connect to a remote iPod" on the Devices page takes the address and token of an iPod daemon
  ([examples/ipod-web](../ipod-web/README.md), on a Raspberry Pi with the iPod on its USB port) and keeps them in
  `~/.zinc/ipod/config.json` (beside the logs; other keys are kept). The remote iPod shows in the sidebar's devices with a network
  mark (its x disconnects it) and opens like a plugged one: overview, specs, albums with covers, songs and playlists come from its
  `/api`; a song played is fetched once into `remote-cache/` beside the logs, then played as a file; Add uploads each file, Delete
  and Eject ask the daemon, which refuses them with a sentence (shown) unless started with `--allow-changes`. Backups, check, repair
  and Optimise stay for an iPod plugged into this computer. `services/ipod.ts` is the one place that chooses local or remote.
- **Finding an iPod.** `ipod.detect()` runs at start and every three seconds while no iPod is shown (Rescan in the sidebar looks
  at once). One mounted iPod is opened by itself; with several, pick one. An iPod plugged in but not mounted is shown with what
  USB tells (model, serial, firmware) and a note to put it in disk mode.
- **Sonos.** The button at the right of the bar picks where the music plays: this computer or a Sonos group (`zinc:sonos` finds
  them: the speaker that answered last, kept in `config.json`, else an SSDP search; `IPOD_DEMO_SONOS=<address>` asks that speaker
  first). On a group, a double-click queues the song and the ones after it (up to 200) on the group, which fetches them over HTTP
  and goes through them by itself; play, pause, next, previous, seek and the group's volume (the bar under the button) go to the
  group, and the bar follows what it plays (read once a second). Changing the output starts the track shown again there. A plugged
  iPod's songs and covers are served by the app on the LAN (`zinc:net`, a free port, a random token in each path, only the open
  iPod's tracks by their id); a remote iPod's come straight from its daemon (`/api/file/<id>?token=`), so the daemon must be
  addressed by a name or address the speakers reach (not `127.0.0.1`), and started with `--token`.
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
- **Delete.** The selected rows of a songs, podcasts, audiobooks or videos page, removed with their files (Allow changes, a question).
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
├── services/ipod.ts      # the iPod, local (zinc:ipod) or remote: detect, open, read, close, covers, files, add, delete, eject
├── services/remote.ts    # a remote iPod: an iPod daemon's /api over zinc:net
├── services/config.ts    # config.json: the remote iPod's address and token, the Sonos speaker found last
├── services/covers.ts    # covers by album, read when shown, freed when dropped
├── services/player.ts    # playing from the iPod, here or on a Sonos group
├── services/sonos.ts     # the Sonos groups, the output chosen, the songs' URLs and the server of a plugged iPod's files
├── services/transfers.ts # the queue of jobs, one at a time, with their progress
├── services/log.ts       # the operations, on the Logs page and in the log file
├── components/           # Sidebar, AllowChanges, Button, PodDrawing, StorageBar, AlbumCover, TrackTable, NowPlaying, OutputPicker
└── pages/                # devices, overview, albums, songs, playlists, photos, files, specs, add, backups, optimise, transfers, logs
```

## Test

`tests/t1/ipod_demo.sh` makes a fake iPod on a 128 MB disk image, fills it with nine tracks in three albums (two with covers),
a podcast, a playlist and three duplicates, then drives the app headless through every page (and the albums again in the dark scheme), compares one
frame hash per page, checks the overview on QuickJS and that nothing is painted while the app is left alone; then it checks the
iPod's health, drops two files on the window, downloads an album, shows the transfers and the log, analyses the iPod on the Optimise page and merges its duplicates, and unmounts and mounts the
disk image while the app runs (it closes the iPod, then opens it again).

`tests/t1/ipod_remote.sh` serves a fake iPod with `examples/ipod-web --allow-changes` and runs the app headless connected to it: the
remote iPod opens, its songs page is compared to a frame hash, a song is played (its file fetched into the cache), one is deleted and a
file dropped is uploaded.
