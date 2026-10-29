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
  `/api`; a song played is fetched once into the iPod's cache (below), then played as a file; Add uploads each file, Delete
  and Eject ask the daemon, which refuses them with a sentence (shown) unless started with `--allow-changes`. Backups, check, repair
  and Optimise stay for an iPod plugged into this computer. `services/ipod.ts` is the one place that chooses local or remote.
- **Finding an iPod.** `ipod.detect()` runs at start and every three seconds while no iPod is shown (Rescan in the sidebar looks
  at once). One mounted iPod is opened by itself; with several, pick one. An iPod plugged in but not mounted is shown with what
  USB tells (model, serial, firmware) and a note to put it in disk mode.
- **Sonos.** The button at the right of the bar picks where the music plays: this computer or a Sonos group (`zinc:sonos` finds
  them: the speaker that answered last, kept in `config.json`, else an SSDP search; `IPOD_DEMO_SONOS=<address>` asks that speaker
  first). On a group, the app's queue is put on the group, which fetches the songs over HTTP and goes through them by itself; play,
  pause, next, previous, seek and the group's volume (the bar under the button) go to the group, and the bar follows what it plays
  (its events, else read once a second). Changing the output goes on with the track shown there, from the same moment. A plugged
  iPod's songs and covers are served by the app on the LAN (`zinc:net`, a free port, a random token in each path, only the open
  iPod's tracks by their id); a remote iPod's come straight from its daemon (`/api/file/<id>?token=`), so the daemon must be
  addressed by a name or address the speakers reach (not `127.0.0.1`), and started with `--token`.
- **The iPod's cache.** What the app reads of an iPod is kept on the computer in a folder named after its FireWire GUID
  (`~/.zinc/ipod/cache/<GUID>/`, beside the backups), for a plugged iPod and a remote one alike: the covers (`covers/`, one PNG
  per album, the largest the iPod stores), the library (`library.json`: tracks, playlists, specs and the database's size and time),
  a remote iPod's songs played (`audio/`, the least recently played dropped past the size set in Settings, 2 GB by default) and its
  plays not yet counted (`plays.json`), and the listen history (`history.jsonl`, below). An iPod opens at once from its cached library; when its database changed since (another
  computer, iTunes, the iPod itself), the library is read again in the background and replaces it. Then the albums' covers not yet
  cached are read into it one by one, so the grid scrolls without waiting for the iPod. The Sonos speakers are served the same files.
- **Every listen counts.** A song heard for half its length or 4 minutes (and longer than 30 s), here, on Sonos or from a remote
  iPod, adds one play to the iPod's play count and last played date (written at once behind Allow changes, else kept in `plays.json`
  and written when changes are allowed; a remote iPod's go to its daemon), and is sent to Last.fm and ListenBrainz when Settings
  has their accounts (now playing too; an offline queue on disk, sent by 50 when the service answers again). A song paused and taken
  up later continues the same listen. Each listen, counted or skipped, is one line of `history.jsonl` (track, artist, title, album,
  duration, time heard, start with its time zone, mac/sonos/remote/subsonic), never rewritten.
- **Settings.** Last.fm: create an API account (last.fm/api/account/create), paste its key and secret, Sign in (the browser asks
  to approve the app), then Finish. ListenBrainz: paste the user token of listenbrainz.org/settings. And the size of the songs'
  cache. Kept in `config.json`.
- **The queue.** As Spotify's: a double-click plays a song and the ones under it ("Next from" the album, playlist or page); a
  right click on a song, a selection, an album or a playlist offers Play, Play next and Add to queue (the system's own menu), which
  go to "Next in queue", before the rest. The list button of the bar opens the queue panel: Now playing, Next in queue (Clear queue)
  and Next from; a row is dragged to another place, its x removes it, a double-click plays it. Shuffle mixes only what follows the
  current song and the hand-added ones, and off brings the list back in its order; repeat goes off, all, one. On Sonos the group's
  queue is the app's from the song it started on (1,000 at most): each change is made there too (AddMultipleURIsToQueue,
  RemoveTrackRangeFromQueue, ReorderTracksInQueue), repeat is the group's play mode, and a change made in the Sonos app comes back
  through the events (the queue read again; replaced by other music, the app's queue stays, paused).
- **The session.** The queue, the song and the moment in it, shuffle, repeat, the output and its volume are kept in
  `session.json` beside `config.json` (on each change, and every 5 s while playing). At the next start the same iPod opens on it,
  paused at that moment; Play resumes there, on the same output. A Sonos group that still plays it is followed as it is (the app
  serves the songs again on the same port and token); one whose queue was replaced is left alone. Another iPod, or none: the file
  waits for that iPod.
- **In the background.** Closing the window while a Sonos group plays from the iPod plugged into this computer keeps the app in
  the menu bar (the track, Play or Pause, Next, Show iPod, Quit iPod): it goes on serving the songs. Cmd+Q then asks first
  ("Sonos is playing from this iPod: quitting stops the music": Keep playing in background, Quit, Quit and clear the Sonos queue,
  Cancel); with transfers not finished it asks too (the one under way always ends: cut halfway, the iPod would keep a file its
  database does not know).
- **Quitting.** Every way out (Cmd+Q, Quit in the menu bar, the window closed, `kill`, Ctrl+C) runs the same steps, in order and
  within 3 s (`services/quit.ts`, `onQuit(name, step)`): the session saved; a Sonos group fed by this app paused (or stopped with
  its queue cleared) while the songs are still served, a group fed by the iPod daemon left playing; the speakers' events
  unsubscribed; the server stopped; the local sound stopped and the iPod closed (nothing written to it).
- **Covers.** Each album's cover is taken from the cache (read from the iPod or the daemon the first time) when its row of the grid
  comes on screen, kept by album while shown and freed with `destroyImage` when the row is dropped.
- **Long lists.** The album grid and every track table are `VirtualList`s: 2,500 songs cost the rows on screen.
- **Back and forward.** What is shown is a history (`zinc:ui/history`): every page, and every album, artist, playlist, photo album,
  photo or note opened, is an entry. ‹ and › at the left of the top bar, Cmd+[ and Cmd+], the mouse's side buttons or a two-finger
  swipe sideways go back and forward, and an entry comes back as it was left: its search, its selected rows and its scroll (each
  list has a `scrollKey` of its entry, so a new visit starts at the top).
- **Search everywhere.** Albums (title, artist, year), artists, songs, podcasts, audiobooks, videos (title, artist, album),
  playlists and the songs inside one, photo albums, notes and files, backups and, with several, the iPods have a search field;
  matching ignores case and accents ("cafe" finds "Café") and every word must match. Cmd+F or Cmd+K (or the magnifier of the top
  bar) searches the whole iPod from any page: songs, albums, artists and playlists, Up and Down to move, Enter to play a song or
  open the rest, Escape to close. Each track's text is folded once per library: on 10,000 tracks a key typed costs under a
  millisecond on the interpreter.
- **Artists.** The album artists with their albums; an album opens on the Albums page.
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
- **Transfers and logs.** Every download, add, backup, restore, delete, check, repair, analysis and merge is a job of one queue (one
  at a time, progress from `ipod.onProgress`, Cancel before it starts). Every operation is on the Logs page and appended to
  `~/.zinc/ipod/logs/demo.log` (beside the backups).
- **Feedback where you are.** A job shows at once on the page it was started from, as the Finder and Music show a copy: a toast at
  the bottom right (its progress live, Show, Cancel while it waits) that turns into its result (Reveal in Finder for a download or a
  backup) and fades after five seconds, unless the pointer is on it; a failure stays red with Show details until closed. Three
  stack, then "+N more". The sidebar's Transfers row shows a ring of the overall progress and a badge of the jobs left, and a red
  dot when one failed and the page was not looked at since. The button that started a job shows a loader and ignores clicks while
  its job waits or runs; a song's arrow turns into a ring, then a check. Eject and mount answer with a toast too. The Transfers
  page itself shows no toast.
- **Light and dark** follow the system (`"scheme": "auto"`).

## Layout of `src/`

```text
src/
├── main.tsx              # mounts the app, routes the pages, closes the iPod on SIGINT/SIGTERM
├── constants.ts          # colours (light and dark schemes), the iPods' colours, sizes, timings, page names
├── format.ts             # durations, sizes, counts
├── state.ts              # iPods found (watched), the open one's library, albums, artists, search, sort, selection, the history, Allow changes
├── search.ts             # the one way to match: folded text (case, accents), every word
├── actions.ts            # what copies or changes: download, add, backup, restore, delete, check, repair, mount, eject
├── optimise.ts           # the analysis, the duplicate groups ticked and kept, the merge
├── services/ipod.ts      # the iPod, local (zinc:ipod) or remote: detect, open, read, close, covers, files, add, delete, eject
├── services/remote.ts    # a remote iPod: an iPod daemon's /api over zinc:net
├── services/cache.ts     # the iPod's cache by FireWire GUID: covers, library, a remote iPod's songs (least recently used out)
├── services/config.ts    # config.json: the remote iPod's address and token, the Sonos speaker found last, the cache's size
├── services/covers.ts    # covers by album, read when shown, freed when dropped; the albums' covers read ahead into the cache
├── services/player.ts    # playing the queue from the iPod, here or on a Sonos group (kept in step)
├── services/queue.ts     # the queue: now playing, next in queue, next from; shuffle and repeat
├── services/session.ts   # session.json: the queue and where it was, resumed at the next start
├── services/background.ts # the menu bar item, and what closing or quitting asks first
├── services/quit.ts      # the quit: its steps in order, within 3 s
├── services/sonos.ts     # the Sonos groups, the output chosen, the songs' URLs and the server of a plugged iPod's files
├── services/transfers.ts # the queue of jobs, one at a time, with their progress
├── services/log.ts       # the operations, on the Logs page and in the log file
├── services/scrobble.ts  # the rule, Last.fm (signed calls, sign-in) and ListenBrainz, their offline queues, the history (shared with ipod-web)
├── services/listening.ts # follows the player: each listen to the scrobbler, the iPod's play counts, the history
├── menus.ts              # the right-click menu: Play, Play next, Add to queue
├── components/           # Sidebar, AllowChanges, Button, PodDrawing, StorageBar, AlbumCover, TrackTable, DownloadMark, Toasts, NowPlaying, OutputPicker,
│                         # QueuePanel, HistoryBar (‹ › and the magnifier), SearchField, QuickSearch (Cmd+F / Cmd+K)
└── pages/                # devices, overview, albums, artists, songs, playlists, photos, files, specs, add, backups, optimise, transfers, logs, settings
```

## Test

`tests/t1/ipod_demo.sh` makes a fake iPod on a 128 MB disk image, fills it with nine tracks in three albums (two with covers),
a podcast, a playlist and three duplicates, then drives the app headless through every page (and the albums again in the dark scheme), compares one
frame hash per page, checks the overview on QuickJS and that nothing is painted while the app is left alone; then it checks the
iPod's health, drops two files on the window, downloads an album, shows the transfers and the log, analyses the iPod on the Optimise page and merges its duplicates, and unmounts and mounts the
disk image while the app runs (it closes the iPod, then opens it again).

`tests/t1/ipod_sonos.sh` plays on a made-up Sonos speaker (`tests/data/sonos/stub_speaker.py`): the songs queued and served, Play
next and Add to queue from the right-click menu, shuffle and repeat, a drag and a removal in the queue panel, a change made by
another app followed, the window closed (the app stays in the menu bar), the quit (Pause, then the events unsubscribed, within the
limit), then the app started again attaching to the group, and left alone by a group whose queue was replaced.
`tests/demo/ipod_queue.sh` does the queue on the Mac output: Play next, repeat, the panel, the window closed (the app quits and saves
`session.json`), and the session shown paused at the next start.
`tests/t1/ipod_nav.sh` fills a fake iPod (a folder) with 40 albums and drives the history and the search: the album grid scrolled,
an album opened and Cmd+[ (the grid at the same place), a page search typed without accents, the global search's groups, Enter on an
album and back to the searched grid, Escape.

`tests/t1/ipod_remote.sh` serves a fake iPod with `examples/ipod-web --allow-changes` and runs the app headless connected to it: the
remote iPod opens, its songs page is compared to a frame hash, a song is played (its file fetched into the cache), one is deleted and a
file dropped is uploaded; the iPod's cache folder then holds the song, a cover and the library.

`tests/t1/ipod_scrobble.sh` runs the scrobbling core against a local stand-in of Last.fm and ListenBrainz (`IPOD_LASTFM_URL`,
`IPOD_LISTENBRAINZ_URL`; the real services are never called): the rule, a listen that adds up, the sign-in, the signatures, the
payloads, the queues kept while offline and sent by 50; then the daemon's `/api/played` and Subsonic `scrobble`, read only and
with `--allow-changes`.
