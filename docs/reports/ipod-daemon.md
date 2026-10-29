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
- **Small.** zinc:net (llhttp on libuv), zinc:ipod (libgpod), zinc:subtle for the MD5 of Subsonic tokens. No database; the covers'
  PNG files are kept per iPod, in a folder named after its FireWire GUID (`<backups>/cache/<GUID>/covers`, `~/.zinc/ipod/cache/...` by
  default, as the app keeps its own), so they are written once, not once per run.

## Command line

```
zinc run examples/ipod-web -- [--port 8686] [--token T] [--user U --password P] [--api-key K] [--allow-changes] [--mount PATH]
    [--log-requests] [--lastfm-key K --lastfm-secret S --lastfm-session SK] [--listenbrainz-token T]
```

- `--token`: the API's bearer token (`Authorization: Bearer T` or `?token=T`); without it `/api` answers 401 except from 127.0.0.1.
  When neither is given a token is generated at start and printed once.
- `--user`/`--password`: the Subsonic account (one); without them `/rest` answers Subsonic error 40.
- `--api-key`: an OpenSubsonic API key a client may send as `apiKey=K` instead of a user and password (AudioMuse-AI's Setup Wizard
  takes one).
- `--allow-changes`: also lets Subsonic clients create, change and delete playlists.
- `--log-requests`: one line per request on the console: the client's address, the method, the path with `p`, `t`, `s`, `apiKey`,
  `token` and `password` masked (`***`), the HTTP status, and `subsonic error N` when the Subsonic answer failed.
- `--lastfm-key`/`--lastfm-secret`/`--lastfm-session`, `--listenbrainz-token`: where the Subsonic clients' scrobbles go besides the
  iPod (the session key is the one the Mac app's Settings got, in its `config.json`). Without them only the iPod counts the plays.

## /api (JSON, bearer token)

| Route | Answer |
|---|---|
| `GET /api/status` | `{"open", "name", "firewireGuid", "marker", "error", "allowChanges", "songs", "albums", "artists", "playlists"}` (`firewireGuid`: the iPod's, in hex without 0x, the name of its cache folders; `marker`: the database's size and time, `"<bytes>:<ms>"`: a client's copy of the library made under another marker is stale), and when the open iPod is seen `"model", "generation", "capacityGb", "totalBytes", "freeBytes", "readOnly"`: what the page's header shows |
| `GET /api/devices` | `{"devices": [Device...], "open": "<mountpoint or ''>"}` (zinc:ipod Device fields as named in ipod.spec.ts) |
| `GET /api/specs` | `{"specs": [{"group","name","value"}...]}` of the open iPod |
| `GET /api/tracks` | `{"tracks": [Track...]}` (Track fields as in ipod.spec.ts) |
| `GET /api/playlists` | `{"playlists": [Playlist...]}` |
| `GET /api/cover/<trackId>?size=N` | the PNG (Reply.file from the cache), 404 when the track has none |
| `GET /api/file/<trackId>` | the track's file, with ranges, `Content-Type` from its extension |
| `POST /api/add?name=<file name>&playlist=<p>` | body: the file's bytes; `{"results": [AddResult]}`; needs `--allow-changes` |
| `POST /api/remove` | body `{"ids": [...]}`; needs `--allow-changes` |
| `POST /api/eject` | closes, `diskutil eject`/`udisksctl`; needs `--allow-changes` |
| `POST /api/played` | body `{"plays": [{"id", "count", "at"}]}` (`at`: seconds since 1970): adds them to the iPod's play counts (`ipod.played`), `200 {"counted": n}`; read only, they wait in `<backups>/cache/<GUID>/plays.json` and the answer is `202 {"pending": n}` (the plays waiting); a later run with `--allow-changes` writes them after its scan. Only the iPod: the app sends its listens to Last.fm and ListenBrainz itself |

Errors: `{"error": "<sentence>"}` with 400, 401, 403, 404 or 500.

## /rest (Subsonic 1.16.1)

Both `/rest/<method>` and `/rest/<method>.view`, GET and POST form; `f=json` gives `{"subsonic-response": {...}}`, else XML.
Auth: `u` with `p` (plain or `enc:<hex>`) or `t` = md5(password + `s`), or `apiKey` (OpenSubsonic: a wrong key is error 44, `apiKey`
with `u` error 43, neither error 10). `status="ok"`, `version="1.16.1"`, `type="zinc"`, `openSubsonic: true`. The parameters are read
from the query and from a POSTed form, repeated ones (`songId`, `songIdToAdd`, `songIndexToRemove`, `id`) as lists.

Methods: `ping`, `getLicense` (valid), `getMusicFolders` (one: the iPod), `getIndexes`, `getArtists`, `getArtist`, `getAlbum`,
`getAlbumList` and `getAlbumList2` (alphabeticalByName, alphabeticalByArtist, newest, random, frequent, recent, byYear, byGenre),
`getSong`, `getRandomSongs`, `getGenres`, `search2`, `search3` (an empty `query` gives every song, paged by `songOffset` and
`songCount`, as Navidrome does), `getPlaylists`, `getPlaylist`, `getLyricsBySongId` (OpenSubsonic: an empty `lyricsList`, the iPod's
lyrics are not read), `getCoverArt`, `stream`, `download`,
`scrobble` (with `submission=false`: now playing on Last.fm and ListenBrainz; else the listen, at `time` or now, counts on the iPod as
`/api/played` does, goes to both services when their accounts are given (an offline queue on disk, sent by 50) and is one line of
`<backups>/cache/<GUID>/history.jsonl`; a song shorter than 30 s is not counted), `getStarred`/`getStarred2` (empty), `getUser` (the one user; `playlistRole` when changes are allowed).
Playlists, with `--allow-changes` only (else error 50 "Changes are off: ..."), each saved to the iPod at once: `createPlaylist` (`name`
and `songId`..., or `playlistId` and `songId`... to replace its songs; answers the playlist), `updatePlaylist` (`playlistId`, `name`,
`songIndexToRemove`... counted in the list before the call, `songIdToAdd`... appended; `public` and `comment` are ignored),
`deletePlaylist` (`id`). A smart playlist is refused (50: its rules fill it), the master playlist is not listed, an unknown song or
playlist is error 70. Others: error 0 "not implemented by this server".

Songs carry what AudioMuse-AI reads: `albumArtist`, `displayAlbumArtist` and `albumArtistId` (the album's artist), `played` (the last
played date) and `userRating` (stars) when set, and `path` as `/iPod/<FireWire GUID>/iPod_Control/Music/Fnn/NAME.ext`: absolute and
the same for this iPod whichever machine serves it.

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
one: overview, specs, albums with covers, songs, playlists from `/api` (kept in the app's cache of that iPod, by its GUID: the next
connection shows them at once and reads them again only when `/api/status`'s marker changed); playing downloads the file to that cache then plays it; Add,
Delete and Eject go through `/api` when the daemon allows changes. Backups, check, repair and Optimise stay local-only (greyed with a
sentence) until the API grows them.

## AudioMuse-AI

AudioMuse-AI (`docs/reports/audiomuse-setup.md`, `docs/reports/ipod-genius.md` 0b) reads a music library through a Subsonic server it
calls "Navidrome": its Setup Wizard takes the server's URL and either a user and password or an API key. It lists the songs
(`search3` with an empty query), downloads them (`stream`) for its analysis, asks `getLyricsBySongId`, and writes its playlists
(`createPlaylist`, `updatePlaylist`, `deletePlaylist`) when asked to. Both servers answer it:

- the daemon: `--user`/`--password` or `--api-key`, `--allow-changes` for its playlists; from AudioMuse in Docker on the same Mac the
  URL is `http://host.docker.internal:8686`;
- the Mac app: Settings > "Share with AudioMuse" serves the iPod plugged into the Mac with the same module
  (`examples/ipod-web/src/services/subsonic.ts`, imported by `examples/ipod/src/services/share.ts`) on its own port (4533 by default),
  user `audiomuse`, a password and an API key made the first time; it is kept on in `config.json` and starts with the app. AudioMuse's
  playlists reach the iPod only while the app's Allow changes switch is on. A remote iPod is not shared (its daemon serves it).

`tests/t1/ipod_web.sh` replays AudioMuse 3.6.4's calls (the parameters of its `tasks/mediaserver/navidrome.py`) against the daemon,
`tests/t1/ipod_share.sh` against the app.

## Not proven yet

The Pi and the C.H.I.P. (cross-platform pass, backlog/later.md): libgpod's dependencies under zig, an HFS+ iPod read only on Linux,
the USB power of a hard-disk iPod on the C.H.I.P.'s host port (a powered hub).
