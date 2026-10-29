# The iPod daemon: an iPod on a Pi, driven from a Mac and streamed by Subsonic

Owner, 2026-10-29: "un daemon qui tourne sur raspberrypi ou chip ntc qui permet de piloter un ipod branché en usb sur un pi depuis une app
sur le mac via un lien réseau et même stream via subsonic depuis le pi ... ultra leger et portable / compilable", then "fait tout".
Decision D178 (docs/reports/zinc-next-decisions.md).

## Shape

```
iPod ──USB── Pi / C.H.I.P.: examples/ipod-web (one Zinc program, compiled: zinc build)
               ├─ /             the management page: library, player, uploads, deletes, eject, specs (it calls /api)
               ├─ /pod.json     the same as JSON (read only, no token)
               ├─ /api/...      the iPod API (JSON), for the Mac app's "remote iPod"
               └─ /rest/...     the Subsonic API 1.16.1 (XML or JSON), for any Subsonic client
```

- **One owner of the database.** The daemon is the only program that opens the iPod's database; the Mac never mounts it. It opens the
  first mounted iPod it finds (or `--mount <path>`) and reopens it when it comes back; one iPod at a time, as zinc:ipod.
- **Read only unless asked.** Writes (add, delete, eject) need `--allow-changes`; without it they answer 403 with a sentence. Opening
  writes nothing on an iPod that already has its SysInfoExtended (a used iPod has it).
- **Files as they are.** `stream` and `/api/file` send the track's file from the iPod with `Reply.file` (blocks, byte ranges: clients
  seek): no transcoding, no ffmpeg; MP3 and AAC play in every client, ALAC in most.
- **Small.** zinc:net (llhttp on libuv), zinc:ipod (libgpod), zinc:subtle for the MD5 of Subsonic tokens. No database, no cache but the
  covers' PNG files in a cache folder.

## Command line

```
zinc run examples/ipod-web -- [--port 8686] [--token T] [--user U --password P] [--allow-changes] [--mount PATH]
```

- `--token`: the API's bearer token (`Authorization: Bearer T` or `?token=T`); without it `/api` answers 401 except from 127.0.0.1.
  When neither is given a token is generated at start and printed once.
- `--user`/`--password`: the Subsonic account (one); without them `/rest` answers Subsonic error 40.

## /api (JSON, bearer token)

| Route | Answer |
|---|---|
| `GET /api/status` | `{"open", "name", "error", "allowChanges", "songs", "albums", "artists", "playlists"}`, and when the open iPod is seen `"model", "generation", "capacityGb", "totalBytes", "freeBytes", "readOnly"`: what the page's header shows |
| `GET /api/devices` | `{"devices": [Device...], "open": "<mountpoint or ''>"}` (zinc:ipod Device fields as named in ipod.spec.ts) |
| `GET /api/specs` | `{"specs": [{"group","name","value"}...]}` of the open iPod |
| `GET /api/tracks` | `{"tracks": [Track...]}` (Track fields as in ipod.spec.ts) |
| `GET /api/playlists` | `{"playlists": [Playlist...]}` |
| `GET /api/cover/<trackId>?size=N` | the PNG (Reply.file from the cache), 404 when the track has none |
| `GET /api/file/<trackId>` | the track's file, with ranges, `Content-Type` from its extension |
| `POST /api/add?name=<file name>&playlist=<p>` | body: the file's bytes; `{"results": [AddResult]}`; needs `--allow-changes` |
| `POST /api/remove` | body `{"ids": [...]}`; needs `--allow-changes` |
| `POST /api/eject` | closes, `diskutil eject`/`udisksctl`; needs `--allow-changes` |

Errors: `{"error": "<sentence>"}` with 400, 401, 403, 404 or 500.

## /rest (Subsonic 1.16.1)

Both `/rest/<method>` and `/rest/<method>.view`, GET and POST form; `f=json` gives `{"subsonic-response": {...}}`, else XML.
Auth: `u` with `p` (plain or `enc:<hex>`) or `t` = md5(password + `s`). `status="ok"`, `version="1.16.1"`, `type="zinc"`,
`openSubsonic: true`.

Methods: `ping`, `getLicense` (valid), `getMusicFolders` (one: the iPod), `getIndexes`, `getArtists`, `getArtist`, `getAlbum`,
`getAlbumList` and `getAlbumList2` (alphabeticalByName, alphabeticalByArtist, newest, random, frequent, recent, byYear, byGenre),
`getSong`, `getRandomSongs`, `getGenres`, `search2`, `search3`, `getPlaylists`, `getPlaylist`, `getCoverArt`, `stream`, `download`,
`scrobble` (accepted, nothing written), `getStarred`/`getStarred2` (empty), `getUser` (the one user). Others: error 0 "not
implemented by this server".

Ids: a track is `tr-<id>`, an album `al-<n>`, an artist `ar-<n>`, numbered in the order of a sort by name at each library load
(stable while the library does not change); cover art ids are the album's or the track's.

## The web page

`/` is a management page in one HTML document (inline CSS and plain JavaScript, nothing fetched from outside: it works on a LAN
without internet), written by `src/web/` and filled from `/api` in the browser. The header: name, model, storage bar, counts, whether
changes are allowed, the connection state (it asks `/api/status` every 5 s and reads the library again when it changed). Songs (search,
sort, pages of 200 rows), albums with lazy covers, playlists; a click plays the file in an `<audio>` element (ranges: seeking works),
previous and next follow the list shown; each song has a download link. With `--allow-changes`: uploads by drop or picker (one
`POST /api/add` per file, a progress bar and the result each), deleting the ticked songs and ejecting, both confirmed inside the page.
The specs in a section that opens. From another machine the page asks the token once and keeps it in the browser (`localStorage`); it
is sent as `Authorization: Bearer`, and as `?token=` for the audio, covers and downloads. The page itself needs no token.

## The Mac app

`examples/ipod`: Devices page, "Connect to a remote iPod" (address and token, kept in the config). A remote iPod opens like a plugged
one: overview, specs, albums with covers, songs, playlists from `/api`; playing downloads the file to a cache then plays it; Add,
Delete and Eject go through `/api` when the daemon allows changes. Backups, check, repair and Optimise stay local-only (greyed with a
sentence) until the API grows them.

## Not proven yet

The Pi and the C.H.I.P. (cross-platform pass, backlog/later.md): libgpod's dependencies under zig, an HFS+ iPod read only on Linux,
the USB power of a hard-disk iPod on the C.H.I.P.'s host port (a powered hub).
