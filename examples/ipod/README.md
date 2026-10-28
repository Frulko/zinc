# iPod

A read-only viewer for a classic iPod (Classic, Nano, Mini, Video, Shuffle) on `zinc:ipod`: plug one in and see the device drawn
in its colour, how its disk is used by kind of media, its albums with their covers, every song (search and sort), its
playlists, and every detail the iPod and its database give (model, serial, firmware, storage, library, artwork formats and
every key of SysInfoExtended). It never writes to the iPod.

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
- **Light and dark** follow the system (`"scheme": "auto"`).

## Layout of `src/`

```text
src/
├── main.tsx              # mounts the app, routes the pages, closes the iPod on SIGINT/SIGTERM
├── constants.ts          # colours (light and dark schemes), the iPods' colours, sizes, timings, page names
├── format.ts             # durations, sizes, counts
├── state.ts              # iPods found, the open one's library, albums, the songs' search and sort; the actions
├── services/ipod.ts      # zinc:ipod, read only: detect, open and read, close
├── services/covers.ts    # covers by album, read when shown, freed when dropped
├── components/           # Sidebar, PodDrawing (the iPod in Views), StorageBar, AlbumCover, TrackTable
└── pages/                # devices (none open, picker, USB only), overview, albums, songs, playlists, specs
```

## Test

`tests/t1/ipod_demo.sh` makes a fake iPod on a 128 MB disk image, fills it with nine tracks in three albums (two with covers),
a podcast and a playlist, then drives the app headless through every page (and the albums again in the dark scheme), compares one
frame hash per page, checks the overview on QuickJS and that nothing is painted while the app is left alone.
