# ipod-web

The iPod daemon (decision D178, `docs/reports/ipod-daemon.md`): one small program for a Raspberry Pi or a C.H.I.P. with an iPod on
its USB port, also run on a Mac. It serves:

- `/`: a page of the iPods plugged in and their specs (model, capacity, storage, firmware, serial...), and the library it serves;
- `/pod.json`: the same as JSON;
- `/api/...`: the iPod's library as JSON, for the Mac app's "remote iPod";
- `/rest/...`: a Subsonic server (API 1.16.1), so any Subsonic client (play:Sub, Substreamer, DSub, Feishin...) plays the iPod's music.

It is the only program that opens the iPod's database: the first mounted iPod with a database (or `--mount PATH`), reopened when it
comes back, closed when it goes. It is **read only** unless started with `--allow-changes`.

## Run it

```sh
zinc run examples/ipod-web                  # then open http://localhost:8686
zinc run examples/ipod-web -- --port 9000 --token T --user ann --password sesame --allow-changes --mount /Volumes/IPOD
zinc build examples/ipod-web -o ipod-web    # one program to copy to the Pi
```

- `--token T`: the `/api` token (`Authorization: Bearer T` or `?token=T`). Without it a token is made at start and printed; requests
  from this machine (127.0.0.1) need none.
- `--user U --password P`: the Subsonic account; without them `/rest` answers error 40.
- `--allow-changes`: allows add, remove and eject; without it they answer 403 with a sentence.

## /api (JSON)

| Route | Answer |
|---|---|
| `GET /api/devices` | `{"devices": [...], "open": "<mountpoint>"}` |
| `GET /api/specs` | `{"specs": [{"group", "name", "value"}...]}` of the open iPod |
| `GET /api/tracks`, `GET /api/playlists` | `{"tracks": [...]}`, `{"playlists": [...]}` with the fields of zinc:ipod |
| `GET /api/file/<trackId>` | the track's file, with byte ranges |
| `GET /api/cover/<trackId>` | the cover as PNG, 404 when the track has none |
| `POST /api/add?name=song.mp3&playlist=Mix` | body: the file; `{"results": [{"file", "id", "error"}]}` |
| `POST /api/remove` | body `{"ids": [...]}`; `{"removed": n}` |
| `POST /api/eject` | closes the library and ejects the iPod |

Errors are `{"error": "<sentence>"}` with 400, 401, 403, 404, 405 or 500.

## /rest (Subsonic)

`ping`, `getLicense`, `getMusicFolders`, `getIndexes`, `getArtists`, `getArtist`, `getAlbum`, `getAlbumList`, `getAlbumList2`,
`getSong`, `getRandomSongs`, `getGenres`, `search2`, `search3`, `getPlaylists`, `getPlaylist`, `getCoverArt`, `stream`, `download`,
`scrobble`, `getStarred`, `getStarred2`, `getUser`; the others answer error 0. XML by default, JSON with `f=json`; auth with `u` and `p`
(plain or `enc:<hex>`) or `t` = md5(password + `s`). Ids: `tr-<track>`, `al-<n>`, `ar-<n>`, `pl-<playlist>`, the albums and artists
numbered in the order of their names. Files are sent as they are on the iPod (no transcoding): MP3 and AAC play everywhere.

## Layout of `src/`

- `main.ts`: the server, the messages at start, the scan timer.
- `state.ts`: the last scan (`detect()`), then the library follows it.
- `page.ts`: the HTML page and `/pod.json`.
- `element.ts`: the element tree every answer is built from, written as XML or JSON.
- `query.ts`: a request's path and parameters.
- `services/options.ts`: the command line. `services/library.ts`: opening the iPod, its albums and artists.
  `services/files.ts`: track files and the covers' cache. `services/web.ts`: the routes. `services/api.ts`: `/api`.
  `services/subsonic.ts`: `/rest`.
- `constants.ts`: the port, the timings, the Subsonic version.

## Notes

- Covers are written once as PNG files into `$TMPDIR/ipod-web/<serial>`; `size` is ignored (the largest cover the iPod stores).
- Linux (Pi, C.H.I.P.): the plugin needs glib, libplist, taglib and libusb (`docs/plugins/ipod.md`). An HFS+ iPod mounts read
  only there: the music plays, the writes fail with the plugin's sentence.
- Test: `tests/t1/ipod_web.sh` makes a fake iPod with two songs and checks the page, `/api`, Subsonic and the writes.
