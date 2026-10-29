# Zinc iPod app and jukebox: how they can interconnect (2026-10-29)

Research only. No code changed in either repo, nothing started, no iPod touched, no running service called (ports 8686, 8000, 8787
untouched). Everything below is read from source; "verify" marks what I did not run.

Sources read. jukebox (`/Users/mowmow/Lab/music-lib-manager`): `README.md`, `AGENTS.md`, `TODO.md`, `docs/architecture.md` (the satellite
contract, lines 165-260), `docs/api.md` (section 9), `apps/satellite/src/serve.ts`, `apps/server/src/{app,sync,jobs,plays,tags,writeback,convert,
ffmpeg,subsonic,auth,acquire}.ts`, `apps/web/src/InfoModal.tsx`, `plugins/*/plugin.json`. Zinc: `docs/plugins/ipod.md`,
`plugins/ipod/index.ts`, `plugins/ipod/native/{ipod.spec.ts,ipod_core.cpp,ipod.host.cpp}`, `examples/ipod/README.md`,
`examples/ipod/src/services/{remote,share,history,genius,audiomuse,scrobble}.ts`, `examples/ipod-web/README.md`, `examples/ipod-web/src/services/{api,plays,subsonic}.ts`,
`docs/reports/audiomuse-setup.md`.

## 0. What each side really is today

**jukebox** (Node 22, Hono, `node:sqlite`, port 8787, API at `/api/v1`, OpenSubsonic at `/rest`).
- Library: flat `tracks` table (one row per song, `renditions` table for several files of one song), FTS5, revision-based delta (`GET /tracks/delta?since=N`).
- Devices: `devices`, `device_tracks` (what a satellite reports), `device_wanted` (hand-picked tracks), sync rules (`syncMode` all/playlists, `syncPlaylistIds`).
  `POST /devices/:id/sync {dryRun}` returns `planSync()` (add / remove / keep / bytes / shortBy), computed in `apps/server/src/sync.ts`.
- **What is NOT real on the server side** (found while reading, important for item 1):
  1. `makeSyncHandler` (`sync.ts` end of file) never calls the satellite. It computes the plan, checks it fits, stamps `devices.lastSync` and ends. No `POST /devices/:id/jobs` is ever sent.
  2. The server does not remember the satellite's URL: `devices` has `satelliteId` but no URL column, and `GET/POST /satellites` (in `docs/api.md` 9) is not implemented in `app.ts`. `serve.ts` registers by calling `POST /devices` on the server; the server cannot call back.
  3. No signed or job-scoped URLs: `POST /auth/tokens` (`app.ts` ~633) makes an ordinary user token with the full rights of its user. `docs/api.md` section 3 says "narrowly scoped"; the code does not scope.
  4. The plan marks `transcode: 'alac'` for a track the device cannot play, but nothing creates the converted file. The `transcode` job (`convert.ts`, `POST` through `jobs.create('transcode', {ids, format, quality, replace})`) exists and stores a **rendition**; the sync does not enqueue it.
  5. `PUT /devices/:id/tracks` (satellite reports contents) stores only name, artist, album, duration, size, format, fingerprint, sourceUrl. No play count, rating or iPod track id fields come back.
  6. Not in the reference satellite: `GET .../jobs/:job/items`, `.../events` (SSE), `PATCH` pause/resume, persisted queue, concurrency, token revocation. The architecture doc lists them; `apps/satellite/src/serve.ts` implements only the minimum.
- Streaming: `GET /api/v1/stream/:id?rendition=|format=|accept=` with `Range` for a stored file (206, `ETag`). A **converted-on-the-fly** response (`streamTranscoded`) is a chunked 200 with no `Range` and no length (a `seek=` seconds query exists). So resume only works for stored renditions.
- Converters (`ffmpeg.ts` ENCODERS): mp3 (320k), aac (m4a, 256k), alac (m4a), opus, flac, wav. Everything an iPod plays is available (mp3, aac, alac, wav).
- Plays: `POST /api/v1/tracks/:id/play {played, startedAt}` (`plays.ts`): Last.fm rule (half the track or 4 min, over 30 s), else `skipCount++`. Columns `playCount`, `skipCount`, `lastPlayed`, `rating`, `loved` on `tracks`. **No per-listen history table**: only counters and the last time. A `play` event goes to plugins (`plugins/lastfm`, `plugins/listenbrainz`, `plugins/homeassistant`, `plugins/lyrics`).
- Subsonic (`apps/server/src/subsonic.ts`, mounted at `/rest`): `ping, getLicense, getMusicFolders, getIndexes, getMusicDirectory, getArtists, getArtist, getAlbum, getSong, getAlbumList2, search2, search3, getPlaylists, getPlaylist, star, unstar, setRating, getStarred2, getGenres, getRandomSongs, getUser, getScanStatus`, plus `stream`, `download` (original bytes only), `getCoverArt`, `scrobble` in `app.ts` ~2804-2850. **Missing**: `createPlaylist`, `updatePlaylist`, `deletePlaylist`, `getAlbumList` (v1), `getSimilarSongs(2)`, `getTopSongs`, `getLyricsBySongId`, `getOpenSubsonicExtensions`. Auth: `u`+`p`/`enc:`, `t`+`s` (needs the optional recoverable password copy, `auth.ts`).
  Ids are jukebox track ids (opaque), `ar-`/`al-` base64 of names. In `subsonic.ts` `readAlbumId` splits the decoded `artist album` string on a single space (`split(' ')`), which cannot hold names with spaces; verify that `getAlbum` works for "Pink Floyd / The Wall" before relying on it.
- Tag editing: see item 4.
- Plugins: host API with `commands`, `recommendations`, `settings`, `hostApi ^1.x`; plugin manifests under `plugins/*/plugin.json`; sidecars for heavy engines.

**Zinc iPod stack**
- `zinc:ipod` (`plugins/ipod`, libgpod): real iTunesDB read and write, copy with `fsync`, restore points before the first change, smart playlists, `played()` play counts, `merge`, covers, backups, `download` (iPod to computer). Does the checksum and SysInfoExtended work (Nano 6G/7G, Classic).
- Daemon `examples/ipod-web` (port 8686): `/api/*` JSON (`status, devices, specs, tracks, playlists, file/<id>` with byte ranges, `cover/<id>`, `POST add?name=&playlist=` body = the file, `POST remove`, `POST eject`, `POST played`), bearer token, `--allow-changes` gate, `/rest` Subsonic **server** of the iPod, a web page. It is the only process that opens the database.
- App `examples/ipod`: reads a local iPod or a daemon (`services/remote.ts`), plays (Mac, Sonos), listening history in SQLite (`services/history.ts`: `listens`, `loved`, `matches`), Last.fm and ListenBrainz scrobbling, Genius (`services/genius.ts`), For you, AudioMuse client (`services/audiomuse.ts`), "Share with AudioMuse" (`services/share.ts`: the iPod served as Subsonic from the app itself).
- The iPod app already **speaks Subsonic as a server, not as a client**. It has no code that reads another Subsonic server. `net.fetch` (`lib/std/fetch.ts`) buffers the whole body (`remote.ts` `fetchFile`: `r.bytes()`, 1 GiB cap), and the daemon `add` takes the whole file in `req.rawBody`. Both matter for large files on a Pi.

## 1. The Zinc iPod daemon as a jukebox satellite

Value for the owner: high. This is the one thing jukebox says it lacks ("no physical iPod has ever been synced", `README.md`) and Zinc has, tested on real databases. jukebox's design keeps the dangerous write (iTunesDB) on a machine next to the iPod, which is exactly the daemon's role on a Pi.

### What the contract needs (from `docs/architecture.md` 202-260 and `apps/satellite/src/serve.ts`)

| Contract | Needed by jukebox | Zinc today | Gap |
|---|---|---|---|
| `GET /satellite` identity `{id, api:"1.0", families:["device"], url}` | discovery by URL or mDNS | none | trivial route |
| `GET /devices`, `GET /devices/:id` with `kind, capacity, battery, acceptedFormats`, free, serial, firmware, model | registration and plan | `/api/devices`, `/api/status`, `Device` has model, serial, firmware, capacityGb, totalBytes, freeBytes, readOnly | mapping only. `acceptedFormats` = `['mp3','aac','alac','wav','aiff']` (docs/plugins/ipod.md "Formats"); FLAC/OGG are refused by the plugin |
| `GET /devices/:id/tracks` (paginated) with `deviceLocalId, name, artist, album, duration, size, format, fingerprint?, sourceUrl` | presence dots, orphans, import | `/api/tracks` (all fields, not paginated) | map `id` to `deviceLocalId`, `title` to `name`, `durationMs/1000` to `duration`, extension of `path` to `format`, `sourceUrl` = `/api/file/<id>?token=`. Add `fingerprint` (the plugin already has Chromaprint: `analyze(true)`, cache `fingerprints.txt`) to make jukebox's match robust |
| `POST /devices/:id/jobs {id, add:[{url, token, name, metadata}], remove:[deviceLocalId]}` idempotent on `id` | the sync | none | **the main work**, see below |
| `GET /devices/:id/jobs/:job` state + `done/total/bytes/error` | polling | `ipod.onProgress` phases | small |
| `GET .../items`, `.../events` SSE, `PATCH pause/resume` | listed in docs, absent from the reference | none | optional first, add later |
| `DELETE /devices/:id/jobs/:job` | cancel mid-transfer | the app's queue has "Cancel before it starts" only | stop between files; a started `ipod.add` must finish (cut halfway the iPod keeps a file its database does not know, said in `examples/ipod/README.md`) |
| Pull with `Range` resume | `.part` file, `Range: bytes=N-`, rename when whole | `net.fetch` accepts headers; response is buffered | fetch in slices (4 MB `Range` requests) and append to `<name>.part` (needs an append or write-at API in `zinc:fs`: verify; else keep slices in memory per file, a 40 MB song is fine, and resume at file granularity, `.part` per song) |
| Commit once, atomically | one iTunesDB write after all files landed | `ipod.add(files, playlist)` copies and saves per call (one save per batch, restore point first) | pass **all downloaded files in one `add`/`addWith` call**; the plugin saves once at the end. Also `remove(ids)` saves once; do `remove` and `add` in the order jukebox wants (remove first frees space; plan already checks `shortBy`) |
| Auth: bearer token on server calls and on pulls | server gives a token with the URLs | daemon has `--token` for its own `/api` | the daemon needs a second secret, the **jukebox token** to put in `Authorization: Bearer` when it fetches `/api/v1/stream/...` (jukebox gives it per job; today it is a full user token, see gaps) |
| Discovery over mDNS | optional | none (mDNS exists in neither Zinc lib nor daemon) | skip: enter the daemon URL by hand (the contract allows it) |

### The sync job on the daemon, step by step

1. `POST /devices/:id/jobs` stores the job in `<backups>/cache/<GUID>/` (the daemon already keeps `plays.json` the same way) and returns 202.
2. For each `add` item: `GET url` with the job's bearer token and `Range` slices, into `<cacheDir>/<job>/<name>.part`, rename when whole. Keep jukebox's `name`.
3. Metadata: use `ipod.addWith([{file, title, artist, album, albumArtist, genre, composer, comment, trackNr, tracks, cdNr, cds, year, rating, bpm}], playlist)`, so the iPod gets jukebox's tags (which win over the file) and the cover (`artworkFile`, or the file's embedded picture). jukebox's `/api/v1/artwork/:hash` gives the cover.
4. Commit: one `addWith` of all files (one save), playlists via `createPlaylist` + `setPlaylistTracks`, one `save()`. Then `load()` and report the new contents with `PUT {jukebox}/devices/:id/tracks`.
5. `remove` list: `ipod.remove(ids)` (deletes files and database rows, one save).
6. All of it behind the daemon's existing `--allow-changes`. Without it the job is refused with a sentence, as `/api/add` already does.

### What is missing, split by side

- **Zinc daemon**: the routes above (about 6), a job store, ranged fetch to a file, a writer of jobs to disk, a small poller to announce itself to jukebox (`POST /devices` + `PUT /devices/:id/tracks`, like `serve.ts` end), `fingerprint` in the track list, a way to report `acceptedFormats`.
- **jukebox server** (needs work for ANY real satellite, not just ours): (1) store the satellite URL, (2) make `makeSyncHandler` really `POST` the job and poll it (or let the satellite push progress), (3) enqueue the `transcode` job for plan items with `transcode != null`, wait for the rendition, then give its URL `...stream/:id?rendition=<id>`, (4) mint a job-lifetime token (a real scope in `auth.ts`), (5) add playlist and metadata to the plan items (today `add` carries only `trackId, name, artist, size, transcode`), (6) `deviceLocalIds` for removals are already there.
- **Zinc plugin**: nothing mandatory. Wishes: a streamed fetch API; `addWith` result already gives ids.

### Risks
- Memory on a Pi: the daemon buffers whole bodies (`rawBody`, `r.bytes()`). One song at a time is fine; never the whole sync.
- jukebox's reference note: "no real iPod has ever been synced". The server half has never run against a satellite that talks back, expect to find bugs there (item 1 gaps 1-5).
- Duplicates: jukebox matches `device_tracks` to the library by fingerprint or artist+title+duration (3 s). The daemon's own `analyze()` duplicate finder and `merge()` work on the same iPod; two systems deciding what is a duplicate. Keep Zinc's merge manual (Optimise page), let jukebox only report.
- Tags: jukebox's `addWith` tags overwrite the file's; to avoid drift after an iPod-side edit (item 4), jukebox should not re-push tags to a track already on the iPod (plan only adds missing tracks, already so).
- Cross-platform pass: the daemon runs on Linux/Pi with the plugin's libs; an HFS+ iPod is read only there (docs/plugins/ipod.md), so a Mac-formatted iPod on a Pi cannot be synced. This is a hardware step and is for the owner.

**Effort: L** (daemon M, jukebox sync handler M, both needed). **First step**: write the daemon half against a stand-in of jukebox: run `apps/satellite` as-is (it is the contract reference), point a Zinc `GET /satellite` + `/devices` + `/devices/:id/tracks` at the fake iPod (`ZINC_IPOD_ROOTS` / sim) and see the device appear in jukebox's UI (registration and presence only, read only, no writes). That alone gives item 2.3 "Import from the device" for real iPods (pull music back off an old iPod: `sourceUrl` = `/api/file/<id>`), which jukebox already implements in `acquire.ts`, and needs no sync-handler work.

## 2. The iPod app browsing a jukebox library and adding to the iPod

Value: high and the quickest path to a useful result. "Pick music from the big library on the NAS and put it on the iPod" is the whole point of an iPod sync tool, and the Zinc app has the iPod half (Add page, `ipod.addWith`, space check, restore point) but only takes local files.

Two ways to talk to jukebox:

| | OpenSubsonic `/rest` | jukebox's own API `/api/v1` |
|---|---|---|
| Browse | `getArtists`, `getAlbumList2` (type alphabetical, newest, random), `getAlbum`, `search3`, `getPlaylists`, `getPlaylist`, `getCoverArt`, `getGenres` | `GET /tracks` (cursor paging, filters, FTS), `/albums`, `/artists`, `/playlists`, `/search`, `/tracks/delta` |
| Fetch a file | `download.view?id=` = original bytes; `stream.view?id=&format=` = on-the-fly conversion, **no Range, no length** | `/stream/:id?rendition=` with `Range`; `?format=` transcodes on the fly |
| Convert once, keep it | not possible | `POST` a `transcode` job (`{ids, format:"aac"|"alac"|"mp3", quality, replace:false}`) creates a stored rendition; later `stream?rendition=<id>` gives `Range` |
| Tags | basic (`song()` in `subsonic.ts`: title, album, artist = albumArtist, track, year, genre) | all columns: composer, grouping, discNumber, bpm, comments, rating, loved, renditions list |
| Other clients | works with anything | Zinc-specific code |
| Auth | `u`+`p` or `t`+`s` | bearer token (`POST /auth/login`, `POST /auth/tokens`) |

**Recommendation**: use jukebox's own API for the content path, and add OpenSubsonic only as a fallback so the same screen works with Navidrome or any Subsonic server (this also keeps the "Share with AudioMuse" model: the Zinc iPod app already has the Subsonic dialect in `ipod-web/src/services/subsonic.ts`). Reasons: the iPod needs a stored AAC/ALAC/MP3 file with `Range`, the Subsonic `stream` transcodes on the fly without a length, and `getAlbum` in jukebox returns fewer tags than `/tracks`. A pure Subsonic client is a lot less code but loses composer, grouping, BPM, album artist, disc number.

How to transcode to an iPod-playable format: read the iPod's accepted formats from the plugin ("Formats", docs/plugins/ipod.md): MP3, AAC/M4A, ALAC, WAV, AIFF, M4B. For each chosen track:
1. If jukebox already holds a rendition in that set (`GET /tracks/:id` lists `renditions`), use it (as `planSync` does).
2. Otherwise `POST` a `transcode` job, target `aac` 256k for small iPods or `alac` for a Classic with room; wait for the job (`GET /jobs/:id`, SSE `/events`), then fetch `?rendition=`. The converted file stays in the jukebox library as a second rendition (this is jukebox's design: "keeping both means the sync stops re-encoding"). If the owner does not want files created on the NAS, fall back to `stream?format=aac` (works, no resume, whole song in memory on our side).

Flow in the Zinc app: a new "From jukebox" source on the Add page (address + token in `config.json`, like the remote iPod in `services/remote.ts`), a browse/search table reusing `TrackTable`, a selection or whole album or jukebox playlist, then a job in the existing transfers queue (`services/transfers.ts`): fetch (Range slices) into the cache, `ipod.addWith` with jukebox's tags, covers via `/artwork/:hash`, then optionally recreate the jukebox playlist as an iPod playlist (`createPlaylist` + `setPlaylistTracks`).

Risks: net.fetch buffering (one track at a time is fine); duplicates with songs already on the iPod (match by artist + title + duration, as jukebox's `byMeta` does, or by fingerprint with `analyze`); a space check before copying (the plugin already refuses a batch that does not fit, keeping 64 MB free); the jukebox `albumId` split bug if the Subsonic path is used.

**Effort: M** (client M-: one service file of fetch calls, one page; no server change if the content is already in AAC/MP3, one extra wait step if a conversion job is needed). **First step**: a `services/jukebox.ts` with `login`, `tracks(query)`, `renditions(id)` and `fetchTo(id, rendition, file)`, tested by a T1 test against jukebox's own test fixtures (`apps/server/test` builds audio with ffmpeg; run a throw-away jukebox in the scratch, port 0, never 8787); then the Add page source.

Note that this item and item 1 are two different directions of the same transfer: item 2 is *Zinc pulls from jukebox when the user asks* (no jukebox change); item 1 is *jukebox decides what goes on the iPod* (needs the jukebox sync handler fixed). Item 2 delivers the value first and also exercises the same fetch/Range/`addWith` code the satellite needs.

## 3. Sharing listening data

State of each side:

| | jukebox | Zinc iPod app |
|---|---|---|
| Per-listen record | none (`playCount`, `skipCount`, `lastPlayed` on the track; scrobbles go out to plugins and are not kept) | `listens` table (uid, ts, artist, title, album, mbid, duration_ms, source, skipped, keys); source = mac / sonos / remote / subsonic; `history.jsonl` mirror |
| Counters on the device | `device_tracks` has none | iPod's own `playCount`, `lastPlayed`, `skipCount`, `rating` |
| Scrobble out | plugins `lastfm`, `listenbrainz` on the `play` event | `services/scrobble.ts` (same two services, offline queue); the daemon too (`--lastfm-*`, `--listenbrainz-token`) |
| Smart playlists | `playlists.ts` rules (`smart`, `rules`; presets like "Top 25 Most Played") evaluated in SQL over `track_tags`, `playCount`, `lastPlayed`... | libgpod rules evaluated by `ipod.evaluateSmart`, refilled at each save |
| Import | none | `historyImport.ts`: Last.fm and ListenBrainz API, ListenBrainz export file |

Directions that work:

1. **iPod plays back to jukebox** (value: the iPod is where much listening happens, jukebox's "Top 25" and "Recently played" smart playlists never see it). Source of truth is the iPod's counters, read at sync time. At each connection compute the delta of `playCount`/`lastPlayed` against the last time (kept in `device_tracks` or in the Zinc cache per GUID) and send one `POST /api/v1/tracks/:id/play {played: <track duration>, startedAt: lastPlayed*1000}` per extra play. `startedAt` is supported precisely for "a satellite that was offline can report yesterday's listening" (`plays.ts` comment). Limitation: the iPod keeps only the **last** time and a count, so N plays since the last sync collapse to one real timestamp; send N plays with the last timestamp minus spread, or just the last one plus a counter bump (Zinc's own `ipod.played()` has the same shape the other way). jukebox would then also scrobble them to Last.fm via its plugins, which would **double-scrobble** if the Zinc app/daemon already scrobbled the same listens: the iPod's own play (not heard in Zinc) is only counted on the iPod, so no duplicate in that case, but listens heard in the Zinc app on the Mac are scrobbled by Zinc AND counted on the iPod by Zinc. Rule to avoid doubles: jukebox accepts only iPod deltas whose listens did not come from the Zinc app (the app's `history` knows its own `source=mac|sonos|remote`), or one side's scrobbling is off.
   - Better: add `POST /api/v1/devices/:id/plays [{trackId|deviceLocalId, count, at}]` on jukebox with a flag `scrobble:false`, so the counter and `lastPlayed` move but no external scrobble is sent. That is a small server change and the right contract for a device (matches the Zinc `ipod.played` item shape `{id, count, at}`).
2. **jukebox plays to the iPod**: `ipod.played([{id,count,at}])` already exists and is what the daemon's `/api/played` and the Subsonic `scrobble` call. A jukebox listen of a track that is on the iPod (jukebox knows via `device_tracks.trackId`) can be sent with `POST /api/played` so the iPod's counters reflect music heard in jukebox. Value: the iPod's own smart playlists (Top 25...) then include it. Cost: S, a jukebox plugin on the `play` event (the host already supports `events:play`, see `plugins/listenbrainz/plugin.json` permissions) that POSTs to the daemon.
3. **Listening history as one stream**: the Zinc `History` store is the richer one. jukebox could expose `GET /api/v1/plays?since=` only if it keeps per-listen rows (it does not). Simplest: a new jukebox plugin or core table `listens` filled from the `play` event; the Zinc app imports it like it imports ListenBrainz (a `historyImport.ts` source `jukebox`). Then Genius, For you and the mixes in the Zinc app use the full listening of the household. Alternative with no jukebox change: both feed **ListenBrainz** (already supported on both sides), and the Zinc app imports from ListenBrainz (`importListenbrainz` exists). That is the zero-change path and is robust.
4. **Smart playlists**: no direct exchange; the two rule languages differ (libgpod's, with "inTheLast" units, vs jukebox's own `SmartRules`). A translator for the common subset (genre, rating, playCount, lastPlayed, added, limit) in one direction (jukebox playlist to iPod `createSmartPlaylist`) is possible but low value: sync as a normal playlist (members resolved by jukebox) is simpler and is what Nano 6G/7G needs anyway.

Risks: double counting (above); the iPod's `lastPlayed` is the last of N; the iPod stores rating as stars 0..5 and jukebox `rating` is an integer, verify range (InfoModal uses 0..5 stars); clock of the iPod (iPods are often wrong); `matches` between systems by artist+title (the Zinc `trackKey`) is the only common key, there is no shared id.

**Effort: S for the ListenBrainz path and for jukebox->iPod plays (plugin), M for iPod->jukebox deltas with the new endpoint, M for a `listens` table in jukebox.** **First step**: point both at the same ListenBrainz account and check that the Zinc `History` imports jukebox's scrobbles (no code); then write the jukebox plugin `ipod-plays` (event `play` -> daemon `/api/played`).

## 4. Reuse of jukebox's bulk tag editor for an iTunes-style multi-edit in the Zinc iPod app

Value: high and well matched. The owner wants "a complete iTunes-like editor with multi-selection editing"; jukebox's `apps/web/src/InfoModal.tsx` (343 lines) already is that design, copied from iTunes' "Multiple Item Information".

### How jukebox does it
- One modal for one or many tracks (`multi = tracks.length > 1`). Tabs: Details, Options, Artwork, File (File only for one track), plus plugin tabs (one track only).
- `FIELDS` table (key, label, type, tab, half-width). Details: name, artist, albumArtist, album, grouping, composer, comments (textarea), genre, year, trackNumber, discNumber, bpm, compilation (check). Options: rating (stars), loved, enabled, kind.
- **Mixed values**: `shared(tracks, key)` returns the common value or the `MIXED` symbol (strict equality of every track). A mixed field is shown **empty with placeholder "Mixed"** (checkbox shown as false). Typing in it sets the patch.
- **Apply checkbox per field** (multi only): every field row has a leading `apply-box`; a field is sent only if its box is ticked, and typing ticks it automatically (`setField` adds to `on`). Un-ticked fields are greyed (`off`) and disabled. Footer says "N fields will be applied". This is exactly iTunes' behaviour and avoids the classic bug of blanking everything.
- Apply: `onApply(patch)` builds a `Partial<Track>` with only ticked and edited fields; the table sends `PATCH /api/v1/tracks {ids, patch, writeToFiles?}`.
- Server (`app.ts` 771-796): `ALLOWED` whitelist, one `UPDATE tracks SET ... , rev = ?` per id with a single new revision (so the delta sync sees them), FTS rebuild, then a **`writeback` job** (`writeback.ts`): per file `writeTags` with node-taglib-sharp, `WRITABLE` = name, artist, albumArtist, album, genre, composer, year, trackNumber, trackCount, discNumber, bpm, comments, grouping, compilation. Checkpoints every 20 files, per-item status (`done`, `failed`, `skipped` for read-only sources), cancellable, resumable by cursor. `rating`, `loved`, `enabled`, `kind` stay in the database only. `writeToFiles:false` skips the file job.
- Separate route for tags on a selection: `POST /tracks/tags {ids, add, remove}` (add/remove rather than replace, so a hundred tracks do not lose tags they did not share).

### What zinc:ipod can write (checked in `native/ipod.spec.ts`, `ipod_core.cpp` `apply()`, `index.ts` `update`)
`ipod.update(id, fields)` then `ipod.save()` (update does not save; the daemon/app must call `save()`, one save for a whole selection). `TrackInput` fields: `title, artist, album, albumArtist, genre, composer, comment, trackNr, tracks, cdNr, cds, year, rating (0..5), bpm, mediaType`, plus the cover with `artworkFile` (or `setArtwork(id, file)`). Compared to jukebox's list:

| jukebox field | zinc:ipod | status |
|---|---|---|
| name, artist, albumArtist, album, genre, composer, year, trackNumber, discNumber, bpm, comments | title, artist, albumArtist, album, genre, composer, year, trackNr, cdNr, bpm, comment | writable |
| trackCount, discCount | `tracks`, `cds` | writable |
| rating | `rating` | writable |
| grouping | not in `TrackInput`/`Track` (libgpod has `grouping`; smart rules read it, so the native struct has it) | **gap**: add to `Track` and `TrackInput` |
| compilation | not in `Track`/`TrackInput` (libgpod `compilation` flag) | **gap** |
| loved | no such field on classic iPods | not applicable (Zinc history `loved` exists in SQLite) |
| enabled (iTunes "checked") | libgpod `checked`; smart playlists use `checkedOnly` | gap, low priority |
| kind | read only (file type) | not editable |
| artwork | `setArtwork`, `artworkFile` | writable |
| not in jukebox but in iTunes' editor: sort artist / sort album / sort title, lyrics, volume adjustment, start/stop time, remember position, skip when shuffling, gapless, media kind, equaliser preset | libgpod has most of them (`sort_*`, `soundcheck`, `starttime`, `stoptime`, `remember_playback_position`, `skip_when_shuffling`, `gapless_*`, `mediatype`) | **not exposed**; `mediaType` is |

**Important to verify before building (the doc and the code disagree)**: `docs/plugins/ipod.md` and the `TrackInput` comment say "Empty strings and 0 keep what the file's tags say", but `ipod_core.cpp` `apply()` tests `if (in.title)` on what looks like an optional (`std::optional`), and the doc for `bpm` says `update(id, { file: '', bpm: 124 })` sets it and "0 clears it". So **clearing a field** (empty string, rating 0, year 0) may or may not work through `update`. A multi-edit needs it (iTunes lets you blank a comment on 50 songs). First check with a T0 test on the fake iPod: `update(id, {file:'', comment:''})`, `rating: 0`, `year: 0`. If it does not clear, fix the plugin (the engine gap rule in `AGENTS.md`: fix the engine, never work around), e.g. by treating an optional that is present as set, empty included.

Not at all in the plugin: **writing tags to the audio file** (jukebox's writeback). On an iPod the database is the source for what the iPod shows, and the file's own ID3/MP4 tags are not what the iPod reads, so editing the database is the right level. A "write tags to the file too" option would need TagLib write calls in the plugin (TagLib is vendored for reading); optional, skip.

### The design to reuse, concretely
- Keep jukebox's three ideas: per-field apply boxes that auto-tick on typing, `MIXED` shown as empty + "Mixed" placeholder, and send only the ticked patch. Add what iTunes also does: a tri-state for checkboxes (mixed = indeterminate), stars with a "mixed" display (jukebox shows 0 stars; better show nothing/dash), a numeric field pair "3 of 12" for track/disc.
- Tabs for the iPod app: Details (as jukebox), Sorting (when the plugin exposes the sort fields), Options (rating, BPM, media kind, skip when shuffling, remember position, volume), Artwork (one cover for all selected, `artworkFile`), Lyrics (single track), File (single track: path, size, bit rate, sample rate, kind, dates, plays, skips - already in `Track`).
- Apply path in Zinc: loop `ipod.update(id, patch)` over the selection, **one `ipod.save()`** at the end (the restore point is taken before the first change of a session by the plugin), progress through `transfers.ts`. A remote iPod: the daemon needs `POST /api/update {ids, patch}`; today it has only `add / remove / eject / played`, and everything is behind `--allow-changes`.
- Tag edits and albums: when album/albumArtist/artist change, the iPod app's album and artist grouping (built in `ipod-web/src/services/library.ts`, `indexLibrary`) must be rebuilt; the cover is tied to the album string in the app cache (`covers/`), so invalidate.
- Where the modal code could be shared: jukebox's modal is React (TanStack Query, `Cover`, jukebox CSS); the Zinc app is Zinc TSX (`zinc:ui/solid`). Reuse is of the *design and the pure logic* (`shared`, `FIELDS`, apply set), not the file. The pure logic is 20 lines and should be copied into a Zinc `src/editor.ts` with its own test.

**Effort: M** for the editor on a local iPod with the current fields (page/modal + `update` loop + save + test); **+S** for exposing grouping/compilation/sort fields in the plugin; **+S** for the daemon `POST /api/update`; **+S** to confirm/fix the clear-field behaviour. **First step**: the T0 clear-field check above, then `src/editor.ts` (pure: `shared`, patch set) with a test, then the modal.

## 5. AudioMuse-AI

**Does jukebox integrate it?** No code. It appears in text only: `README.md` ("Planned satellites lean on iOpenPod ... and AudioMuse for sonic analysis"), `docs/architecture.md` lines 43, 266, 352 ("`analysis` family: ListenBrainz, AudioMuse"), 460-462 (a "Sound map" tab and "Real BPM" column as future contribution examples), and `TODO.md` item **5.7** "AudioMuse - the half that could be verified is done, the half that could not is not started". The verified half: jukebox's Subsonic emitter was completed so AudioMuse can walk the library (`getIndexes, getMusicDirectory, search2, getGenres, getRandomSongs, getUser, getScanStatus`, and `download.view` no longer converts). **Not built**: the client that asks AudioMuse for similar tracks ("its endpoints are behind a Swagger page on a running instance, two fetches did not produce them, and inventing them would be fiction"). `docs/reports/audiomuse-setup.md` in this repo has exactly those endpoints, captured on a running AudioMuse 3.6.4: `GET /api/similar_tracks?item_id=&n=`, `/api/search_tracks`, `POST /api/analysis/start`, `GET /api/status/<task_id>`, `POST /api/create_playlist`, `/api/clustering/start`, `/api/find_path`, `/api/similar_artists`, `/api/sonic_fingerprint/...`, with `Authorization: Bearer <API_TOKEN>`. That is the missing piece of 5.7 and it can be handed to jukebox.

**Could the Zinc recommendations (`examples/ipod/src/services/genius.ts`) run against the jukebox library?** Yes, in two layers.
1. *AudioMuse on jukebox's library* (no Zinc code): point AudioMuse's setup wizard at `http://<jukebox>:8787/rest` (type Navidrome; auth `u`/`p`). The captured handshake needs `search3`, `getAlbumList2`, `getAlbum`, `stream`, which jukebox has. Ids become jukebox track ids (not `tr-<ipod id>`). Missing for playlist write-back: `createPlaylist`, `updatePlaylist`, `deletePlaylist` in jukebox's Subsonic (AudioMuse calls them to publish "instant" and cluster playlists), plus `getLyricsBySongId` (optional, harmless failure). AudioMuse analysis is CPU-bound (about 1 song per 40 s of audio on the M1 for a 40 s clip, hours for a real library) so it should run once on the server machine, not through a Pi.
2. *Zinc genius reading AudioMuse results for a jukebox library* (small Zinc code): `services/audiomuse.ts` already is a client (`sync`, `fetchNear`, `fetchPath`, `soundVectors`, `attachDeep`) and keeps `cache/<GUID>/deep.v1.json` keyed by the iPod's ids, with `Matcher` fallback "same artist, title and album" for ids it does not know (the `ids given that are not on the iPod`). So if AudioMuse analysed the jukebox library, the Zinc app can ask for similar tracks of an iPod song and map answers back to the iPod by artist+title+album. It works today across servers by that fallback. What cannot work today is `genius.ts` tier 1 (co-listening from the Zinc `History`, similar artists from Last.fm), which is independent of the library and already works on whatever the iPod holds.
3. *A Genius over the whole jukebox library, to pick what to add to the iPod* (new): the same functions (`Weights`, PMI sessions, `attachDeep`) take tracks of the iPod only (`ipod.Track[]`). To rank jukebox tracks, the candidate set must be jukebox's `GET /tracks` rows converted to the same shape. The signals exist for them: the Zinc listening history is keyed by `trackKey(artist,title)`, not by the iPod id, so it already covers any track of any library; the deep layer uses AudioMuse ids. The work is a candidate-provider interface (iPod tracks now, jukebox tracks later) in `genius.ts`/`forYou.ts`, M.
   Ideas it opens: "Fill the iPod with 2 GB of songs like what I play" (Genius run against the jukebox library, then item 2 transfers them), "Rediscover" shelves taken from jukebox's unplayed tracks.

Risks: AudioMuse is AGPL, always a separate process (already how the Zinc app uses it); one AudioMuse instance, two Subsonic sources (the iPod's through the app/daemon and jukebox's) would give two id spaces in one database; separate instances or one instance on jukebox only. Disk: 4.4 GB image (`audiomuse-setup.md`). Docker ghcr pull problem noted there.

**Effort: S** (configure AudioMuse on jukebox; add the 3 playlist write routes to jukebox's Subsonic), **M** (jukebox client of `/api/similar_tracks` as a plugin recommendation: manifest `contributes.recommendations`, one command - the host API already supports this, see `plugins/listenbrainz/plugin.json` "trending"), **M** (candidate-provider in Zinc genius). **First step**: in jukebox implement the TODO 5.7 client with the endpoints documented in `docs/reports/audiomuse-setup.md`, as a plugin `audiomuse` with a `similar` command (track tab "Similar tracks" in `InfoModal`) - the endpoint list is now facts, not fiction.

## 6. Recommended order

1. **Item 3a, no code**: point both apps at the same ListenBrainz account. Immediate shared listening, zero risk.
2. **Item 4, T0 check + pure editor logic** (clear-field behaviour of `ipod.update`, then `src/editor.ts` and the modal). Independent of jukebox; it is the owner's explicit wish and reuses jukebox's design. Fix the plugin gap first (grouping, compilation, clearing) per the "fill the engine's gaps" rule.
3. **Item 2, "From jukebox" source in the Zinc iPod app** (jukebox API, rendition-aware, conversion job). Delivers the headline use (jukebox library to iPod) with **no change in jukebox** and builds the ranged-fetch + `addWith` code that item 1 needs. Do the jukebox API path first, Subsonic fallback later.
4. **Item 1, read-only satellite** (`/satellite`, `/devices`, `/devices/:id/tracks` with fingerprints) so jukebox shows and imports real iPods; then the sync job once jukebox's `makeSyncHandler`, satellite URL, token scope and transcode step exist (those are jukebox tasks; propose them to its owner/session, do not edit that repo from here).
5. **Item 3b/3c**: `POST /devices/:id/plays` on jukebox and the iPod->jukebox delta; the jukebox plugin that sends its plays to the daemon.
6. **Item 5**: AudioMuse client in jukebox (TODO 5.7) with the captured endpoints; Subsonic playlist-write routes; the Zinc candidate-provider last.

What I did not prove: that `net.fetch`/`zinc:fs` can append or write-at (needed for sliced resume); that `ipod.update` can clear a field; that jukebox's `getAlbum` handles names with spaces; how `rating` is scaled in jukebox's Subsonic `setRating` (stars 1-5 in the protocol, 0..5 stored); whether the real `POST /tracks/:id/play` needs auth when the server is claimed (yes: bearer from the middleware, `GUEST_WRITES` allows the `play` capability). These are the first checks of the matching steps.

## 7. Status (2026-10-30)

- **Item 2 done** (`examples/ipod/src/services/jukebox.ts`, `jukeboxAdd.ts`, `pages/add/JukeboxSource.tsx`, Settings › jukebox;
  `tests/t1/ipod_jukebox.sh` against `tests/data/ipod-jukebox/stub.py`): jukebox `/api/v1` first, Subsonic `/rest` when there is no
  `/api/v1` (token `user:password` or an OpenSubsonic API key). A song in no iPod format gets one `POST /transcode {ids, format:
  "aac"}` for the whole add, the job is polled (`GET /jobs/:id`), then the new rendition is fetched with `Range`; a song still
  without one (no ffmpeg, a read-only source, a non-admin token) is converted while sent (`stream?format=aac`, no resume). Files come
  in 8 MB `Range` slices into `<cache>/jukebox/<id>.<ext>.part/` and resume from the last slice. Remote iPods: `/api/add`, then
  `/api/update` for the tags (the cover is the file's own). Checked: the `getAlbum` split bug of section 0 is not one, the separator is a NUL
  (`subsonic.ts` `albumId`), not a space.
- **Item 1, read-only half done** (`examples/ipod-web/src/services/satellite.ts`, `tests/t1/ipod_satellite.sh`): `/satellite`,
  `/devices`, `/devices/:id`, `/devices/:id/tracks` (paged), and `--jukebox` announces the iPod (`POST /devices`, `PUT
  /devices/:id/tracks`). `format` is the file's extension like the reference satellite, because `acquire.ts` names an imported file
  `<name>.<format>` (a codec name `aac` would give `song.aac` for an MP4 file).
- **Item 3b (plays to jukebox) not started**; the next step, exactly: in jukebox add `POST /api/v1/devices/:id/plays` taking
  `{items: [{deviceLocalId, count, at}]}` (the shape of `ipod.played`), resolving `deviceLocalId` through `device_tracks.trackId`
  and calling a variant of `recordPlay` (`apps/server/src/plays.ts`) that adds `count` to `playCount`, sets `lastPlayed = max(at)`
  and does not call `events.emitPlay` (no plugin scrobble). Then in the daemon (`services/satellite.ts` `announce()`): keep
  `<cache>/<GUID>/jukebox-plays.json` with each track's `playCount` last reported, send the positive deltas with `at = lastPlayed`
  after the `PUT .../tracks`, and store the new counts only on a 2xx. Plays made in the Zinc app reach the iPod as counts too and
  are sent the same way: jukebox counts them but does not scrobble them, so nothing is scrobbled twice (the app scrobbles its own).
