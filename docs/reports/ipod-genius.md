# iPod Genius: smart playlists, analysis-based playlists and a "For you" home

Date: 2026-10-29. Owner request for `examples/ipod` (smart playlists; playlists proposed from an analysis of the songs, heard on the Mac first,
then saved to the iPod, "like Genius in iTunes without Apple"; then a Spotify-style "For you" page fed by the Last.fm scrobbles).
Research only: nothing was changed or built. Scores follow `RULES.md` §4 (fit x3, performance x3, size x2, maintainability x2, licence x2,
portability x1, effort x1; each 1-5, maximum 70).

**Evidence tags.** `[code]` = read in this repository today. `[V]` = queried today with the GitHub API (stars, licence, last push).
`[bg]` = background knowledge, not re-checked online (Last.fm and ListenBrainz API details, accuracy figures, licences of third-party
models). `[est]` = my estimate, to measure (Raspberry Pi costs). Every `[bg]` and `[est]` item is a thing to verify in the task that uses it.

---

## 0. Summary and recommendation

1. **Real smart playlists are feasible on the classic iPods** (everything libgpod writes through the iTunesDB: Classic, Nano 1G-5G, Mini,
   Video, Shuffle). They are not on the Nano 6G/7G (SQLite database: libgpod has no smart-playlist code there `[code]`). We must evaluate
   the rules ourselves on the Mac (the iPod is not known to evaluate them; to verify on a real device) and write rules + resulting members.
2. **BPM is the bridge**: libgpod has a BPM field and a BPM smart-rule field `[code]`. If the analysis writes the detected tempo into
   tracks that have none (opt-in), "tempo between 120 and 130" becomes a real iPod smart playlist. Key/energy have no field: they stay
   in our own playlists (saved as normal playlists), or optionally in the `Grouping` string (opt-in).
0. **OWNER DECISION 2026-10-29: two tiers (section 0b supersedes anything below that says otherwise).** Tier 1 "light", built into
   the app and usable by the daemon on a Pi: metadata, listen history, imported Last.fm/ListenBrainz history, Last.fm/ListenBrainz similar
   data, and only cheap permissive audio features (loudness with libebur128, tempo at most; no key/MFCC/ML). Tier 2 "deep", optional:
   AudioMuse-AI pointed at our Subsonic endpoint; the app reads its results over its REST API and maps them back to iPod track ids.
3. (Superseded by tier 1/2 for scope; kept as the cost/score reasoning) **Core analysis in the plugin, no new service**: a thin feature extractor (tempo, key, loudness, spectral/timbre, energy) on vendored
   permissive parts (libebur128 MIT, KissFFT/pocketfft BSD, the platform decoder on macOS / miniaudio elsewhere). Score 60/70, against 47
   for linking Essentia (AGPL) and 38 for ONNX embeddings (heavy, model licences are non-commercial `[bg]`).
4. **Never link GPL/AGPL** (Essentia, aubio, KeyFinder, QM-DSP, bliss-rs, Gist, AudioMuse-AI). They can be **optional external
   processes** the user installs (Essentia's `streaming_extractor_music`, AudioMuse-AI), never shipped, off by default.
5. **Genius itself needs other people's libraries**: we do not have that data. The substitute is audio similarity + metadata + the
   owner's own listening history; the optional web data (Last.fm `artist.getSimilar`, ListenBrainz) only widens the artist graph.
6. **The "For you" home** is computed on the Mac from a local history database (Last.fm / ListenBrainz import, matched to tracks by
   normalised artist+title), the analysis features and the iPod's own play/skip/rating counts. Shelves are cheap (brute-force kNN over
   a few thousand tracks, milliseconds); the expensive part is the one-off analysis (Mac: minutes; Pi: hours, so it runs where the files are).

---

## 0b. The two tiers (owner decision, supersedes the rest where they differ)

### Tier 1: light, built in (Mac app, and the daemon on a Pi)
- **Inputs**: iPod metadata and counters (plays, skips, rating, last played, added, genre, year, BPM tag); the user's history imported
  from Last.fm / ListenBrainz (section 5); optional online similar data (`artist.getSimilar`, ListenBrainz similar artists), off by default;
  tags already in the files (BPM, initial key, ReplayGain: TagLib is vendored).
- **Audio features, only the cheap permissive ones**: loudness and dynamic range (libebur128, MIT, one pass), and **tempo** as the one
  optional extra (onset envelope + autocorrelation on KissFFT, ~150 lines, fixture-tested). **Dropped from tier 1: key, chroma, MFCC,
  embeddings, clustering on audio.** Cost: a 60 s window decode + one FFT pass: Mac ~0.05-0.15 s/track, Pi 3B+ ~1-3 s/track `[est]`;
  decoder constraints as in section 3 ("Decoding gap"; on a Pi, MP3/FLAC/WAV/Vorbis through miniaudio, AAC/ALAC until a decoder is chosen).
- **Similarity in tier 1** (no audio vectors): `sim = w_a·artistGraph + w_g·genre/decade + w_h·co-listening + w_l·loudnessGap + w_t·tempoGap`, where
  *co-listening* is the open stand-in for Genius' crowd, computed from the user's own history: two songs are close when they are played
  within the same session (gap < 30 min) more often than chance (item-item co-occurrence, PMI over sessions), and *artistGraph* is the
  Last.fm/LB similar-artist score when online data is on. Mixes cluster on this graph (genre + co-listening), not on audio.
- **Always works** offline, with an empty history (it then falls back to metadata + iPod counters), and on a Pi.

### Tier 2: deep, optional (AudioMuse-AI)
AudioMuse-AI (AGPL-3.0, so only ever a separate process we talk to, never linked or shipped) analyses the audio with neural models
(MusiCNN-type embeddings, mood scores, tempo, key, energy; CLAP text-to-music search in recent versions `[bg]`), keeps them in its
PostgreSQL, and serves similar songs, paths between songs, clustering/instant playlists, artist similarity and a library export over a
REST API. It **does not read files itself**: it lists and downloads them through the Subsonic API of a "media server"
(`tasks/mediaserver/navidrome.py` `[V, read today]`). So we present our iPod as a Navidrome-like Subsonic server.

#### What AudioMuse calls on the Subsonic side (read from `navidrome.py`, v3.6.4 era, pushed 2026-10-28)
Transport: `GET|POST {base}/rest/<endpoint>.view` with query/form params `v=1.16.1`, `c=AudioMuse-AI`, `f=json` and **either** `u` + `p=enc:<hex of
the password>` (the legacy "enc:" form) **or** `apiKey=<key>` (OpenSubsonic API-key auth; chosen in its Setup Wizard). Reply:
`{"subsonic-response": {"status":"ok"|"failed", "error":{"code","message"}, ...}}`; auth errors are recognised by codes 40-44. Timeouts: 300 s
(downloads stream). Endpoints, exactly:

| Endpoint | Params it sends | Fields it reads from the reply |
|---|---|---|
| `getMusicFolders` | none | `musicFolders.musicFolder[]` `{id, name}` (libraries; only if it filters by library name) |
| `search3` | `query=''`, `songCount` (<=500), `songOffset`, and `artistCount=0&albumCount=0` in the connection test | `searchResult3.song[]`: `id`, `title`, `artist`, `artistId`, `albumArtist`, `displayAlbumArtist`, `album`, `path` (else `url`), `year`, `userRating`, `duration` (s), `suffix`. **An empty query must return all songs, paged by offset** (Navidrome behaviour) |
| `getAlbumList2` | `type=newest` (also `frequent`), `size` (<=500), `offset`, optional `musicFolderId` | `albumList2.album[]` with `id` |
| `getAlbum` | `id` | `album.song[]`: the same fields as `search3`, plus `albumArtistId`, `played`/`lastPlayed` |
| `getSong` | `id` | `song.played` or `song.lastPlayed` |
| `stream` | `id` (raw, no transcoding parameters) | the file bytes (it names the temp file from `suffix`, else from the `path` extension); must be streamable, ids stable |
| `getPlaylists` | none | `playlists.playlist[]` `{id, name}` |
| `getPlaylist` | `id` | `playlist.entry[].id`, `playlist.songCount` |
| `createPlaylist` | POST `name`, `songId` repeated (batches of 40) | `status ok` and a `playlist` object with its `id` |
| `updatePlaylist` | POST `playlistId` with `songIdToAdd` repeated + `public=true`, or `songIndexToRemove` repeated (descending) | `status ok` |
| `deletePlaylist` | POST `id` | `status ok` |
| `getLyricsBySongId` (OpenSubsonic) | `id`, 2.5 s timeout | `lyricsList.structuredLyrics[].line[].value`, `synced`; **optional**: any failure is ignored |
Notes: (a) the **`path` must be absolute** (its connection test warns "Navidrome is returning relative paths" when fewer than 80% are
absolute; it only affects its automatic matching of libraries across servers, analysis still runs) -> our daemon returns the real path on
the iPod's volume as seen by the daemon, or a stable fake absolute path like `/iPod/<guid>/F07/ABCD.m4a`; (b) `id` strings must never
change across restarts and saves (ours are the dbid in hex `[code]`); (c) AudioMuse makes its own canonical ids from a fingerprint of the
song and maps them to each server's ids, so results come back to us **as our own ids** in `item_id`; (d) it also writes playlists back with the
three playlist calls (we may let it, or leave playlists to the app: see below).
What our Subsonic side must add (checklist, `examples/ipod-web` or the Mac app, one shared module): `search3` with empty query + `songOffset`;
`getAlbumList2` types `newest` and `frequent`; `getAlbum`; `getSong`; `stream` of the original file; `getMusicFolders` (one folder "iPod");
`getPlaylists/getPlaylist/createPlaylist/updatePlaylist/deletePlaylist` (mapped to the iPod's playlists, **writes only when Allow changes is on
and refused with a Subsonic error otherwise**, so the analysis can run on a read-only session); `apiKey` auth (simplest: one random key
per pairing, shown once) and `u`/`p=enc:` as a fallback; optional `getLyricsBySongId` returning an OpenSubsonic "not found".
The Subsonic module must also serve a plugged iPod from the **Mac app** (a local HTTP port with `zinc:net`, as the Sonos feature already does
for tracks `[code: README]`), so an AudioMuse running in Docker or natively on the Mac reaches `http://host.docker.internal:<port>`.

#### How the app discovers and talks to AudioMuse
- **Discovery**: Settings > "Deep analysis (AudioMuse-AI)": a URL (default `http://127.0.0.1:8000`, also tries `audiomuse.local:8000` via mDNS)
  and the **API token** (AudioMuse's `API_TOKEN`: machine callers send `Authorization: Bearer <token>` `[V, docs/AUTH.md]`). "Test" calls
  `GET /api/last_task` and `GET /api/active_tasks` (200 = reachable) and `GET /api/sync?fields=index&limit=1` (shows how many tracks it knows).
  The pairing screen shows the three things to type into AudioMuse's wizard (the Subsonic URL of our endpoint, the apiKey, "type: Navidrome")
  and has a "Copy". The app never installs or starts AudioMuse (outward-facing, heavy); the doc links its releases (native macOS/Linux packages
  embed PostgreSQL).
- **Starting an analysis**: `POST /api/analysis/start` (bearer token) with `{num_recent_albums, top_n_moods}`; progress by polling
  `GET /api/active_tasks` / `GET /api/status/<task_id>` (every 3 s while the Transfers job is open) -> a Transfers job "Deep analysis (AudioMuse)".
  `POST /api/cancel/<task_id>` on cancel. Optional `POST /api/clustering/start` for its playlists.
- **Reading results** (all `GET`, JSON, tracks keyed by our server's ids):
  - `/api/sync?fields=index` (manifest `{id, fp}` for change detection) then `/api/sync?ids=a,b,c&include_embeddings=false` (<=500 per page): per track
    `item_id, title, author, album, album_artist, year, tempo, key, scale, mood_vector, other_features, energy, rating` -> **tier-2 features**
    (tempo, key/scale, energy, mood scores: danceable, aggressive, happy, party, relaxed, sad). With `include_embeddings=true` the MusiCNN (and
    CLAP) blobs too: for **our own local k-means/kNN on its embeddings** (cache as `deep.v1.bin`; no round trip per query).
  - `/api/similar_tracks?item_id=ID&n=50&eliminate_duplicates=true&mood_similarity=false|true` -> `[{item_id,title,author,album,distance}]`: **"Genius from
    this song" in tier 2** (also by `title`+`artist`). `/api/find_path?start_song_id=..&end_song_id=..&max_steps=..` for smooth transitions;
    `/api/similar_artists?artist=..&n=..` (GMM similarity); `/api/clap/search` (POST text query, e.g. "calm piano") when CLAP is enabled.
  - `/api/create_playlist` exists on its side (writes to the media server); we do **not** use it: we write the iPod playlist ourselves (4.7), so
    only the app writes to the iPod.
- **Mapping back to iPod track ids**: AudioMuse echoes the ids we gave it, so the map is `item_id` (hex dbid) -> `Track.id`; verified at
  import time (ids not in the open library are dropped; the count of unknown ids is shown). If the same iPod is used through the Pi daemon and
  the Mac, both use the same dbids. If the daemon ever gives synthetic ids, a `title+artist+album` fallback map (the normaliser of 5.3) is used.
- **Failure and staleness**: unreachable -> the page says "Deep analysis offline" and uses cached tier-2 data (`deep.v1.bin`, with its
  fetch date) read-only; a 401 -> asks for the token; new songs on the iPod not yet in AudioMuse's `/api/sync` manifest -> shown as "not yet analysed (N)" with a
  button "Analyse new songs" (starts an analysis); tier 1 covers them meanwhile. Version drift is real (its docs insist on aligned versions): the app
  reads the version from the About/`/api` openapi if present and warns when an endpoint it needs answers 404.

#### How results merge on "For you" (section 5)
One `Signals` object per track: tier-1 signals always, tier-2 fields when present. Rules:
1. **Similarity**: `sim = sim_tier1` when no tier-2 data for either track; else `sim = 0.65·sim_deep + 0.35·sim_tier1` where `sim_deep` is cosine on
   the AudioMuse embeddings (local kNN) or `1/(1+distance)` from `/api/similar_tracks`; tier 1 keeps the taste evidence (what *you* played together)
   and artist graph, tier 2 brings the sound. Weights live in the same JSON as 4.3.
2. **Shelves**: Daily Mixes cluster on the **deep embedding** when available (taste clusters of sound), else on the tier-1 graph; Discover/
   Rediscover rank by deep similarity to the top affinity tracks when available; "Because you listened to X" calls `/api/similar_tracks` when online,
   else the local tier-1 neighbours; smooth ordering of mixes uses tempo/key/energy from `/api/sync` when present, else tier-1 tempo/loudness only.
   On Repeat, Repeat Rewind, Jump back in, Top lists, Wrapped use **no audio at all**: identical in both tiers.
3. **Explanations** name the source ("close in sound (deep analysis)", "you play these together", "similar artist (Last.fm)").
4. **Playlists** always saved by the app from the merged result; AudioMuse's own playlists are listed read-only if `getPlaylists` shows them.

#### What works with AudioMuse absent
Everything in section 5 except the deep-sound parts: all history shelves, mixes by genre/co-listening/artist graph, Genius-from-song on tier-1
similarity, smart playlists (real ones), rule editor, loudness-aware ordering. The "Deep analysis" card on the page says what is missing and how to
connect. Nothing blocks on AudioMuse, nothing is lost when it goes away (its cached fields stay until the user clears them).

### Weight, fit and verdict for AudioMuse-AI (as a service)
Stack: Flask app + worker + PostgreSQL 15 (task queue inside Postgres, no Redis in the current architecture doc `[V]`), ONNX models; Docker
Compose, Kubernetes, or native packages with embedded PostgreSQL (macOS arm64, Linux x86_64/arm64, Windows). README lists tests on a Pi 5 8 GB
and a Mac Mini M4 and advises 8 GB RAM `[V]`. **Mac**: native package, fine (first analysis of ~3,000 songs: hours of CPU `[est]`, once). **Pi 3/4**:
no (tier 1 only). **Pi 5 8 GB**: possible but slow; better to run AudioMuse on the Mac and have it read our Subsonic endpoint over the LAN.
Licence: AGPL-3.0 -> separate process only; its model weights may carry their own non-commercial terms `[bg]`: the user installs it, we ship
nothing of it. Maintenance: very active (v3.6.4, 2026-10-16; 2.8k stars `[V]`). Risks: API drift (mitigated by version check and optional use), its auth
(bearer token), data volume (embeddings 200 floats x tracks: 3,000 tracks ~ 2.4 MB).


---

## 1. iTunes smart playlists and what libgpod writes

### 1.1 The rule model (iTunes, `[bg]` completed by `itdb.h` `[code]`)
- A smart playlist = **preferences** (`Itdb_SPLPref`: `liveupdate`, `checkrules` (match rules or not), `checklimits`, `limittype`,
  `limitsort`, `limitvalue`, `matchcheckedonly`) + **rules** (`Itdb_SPLRules`: `match_operator` AND/OR, a list of `Itdb_SPLRule`:
  `field`, `action`, `string` or `fromvalue/fromdate/fromunits`, `tovalue/todate/tounits`) + the **members** (the track list the database
  also stores: the iPod shows this list).
- **Fields** (`ITDB_SPLFIELD_*`): song name, album, artist, album artist, composer, genre, grouping, comment, kind, tv show; bitrate,
  sample rate, year, track number, disc number, size, time, play count, skip count, rating, **BPM**, compilation, video kind, season;
  dates: added, modified, last played, last skipped; **playlist** (is / is not in playlist X). iTunes' newer fields (Love, Work,
  Movement, Sample rate variants, `Category`, `Description`, `Podcast`, `Purchase`) are in the enum but not evaluated by libgpod.
- **Actions**: strings: is, is not, contains, does not contain, starts with, ends with (and "does not start/end", not in iTunes);
  integers: is, is not, greater than, less than, in the range (and negations); dates: in the last / not in the last N
  minutes/hours/days/weeks/months/years (units are seconds in `fromunits`); binary AND (video kind, compilation); a date rule is stored
  with the magic `fromvalue = 0x2dae2dae2dae2dae`.
- **Limits**: by songs, minutes, hours, MB, GB; selected by: random, name, album, artist, genre, most/least recently added, most/least often
  played, most/least recently played, highest/lowest rating. "Match only checked songs" and "live updating".
- **Live updating** in iTunes = iTunes re-evaluates when the library changes (play counts synced back, tags edited). Without iTunes
  nobody does it: the app must be that evaluator.

### 1.2 What libgpod does for us
- **Reads and writes** the smart playlist chunks of the iTunesDB (mhod types 50 and 51) `[code: itdb_itunesdb.c 1743, 4607, 5596]`.
  Our plugin already keeps unknown rules byte for byte (`ipod_core.cpp` line 45 comment) and lists `smart` in `Playlist` `[code]`. It
  refuses to set the tracks of a smart playlist ("filled by its rules", line 1006) and creates only normal ones (line 978).
- **Evaluates**: `itdb_splr_eval` handles: name, album, artist, genre, kind, comment, composer, grouping, bitrate, sample rate, year,
  track/disc number, size, time, play count, skip count, rating, BPM, compilation, dates added/modified/last played/last skipped, playlist,
  album artist, tv show, season, video kind `[code]`. `itdb_spl_update(pl)` fills `members` from the rules, limits and sort;
  `itdb_spl_update_all(itdb)`; `itdb_spl_update_live` only those with `liveupdate`. **libgpod does not call them on save** (no call in
  the write path or in our plugin `[code]`): the plugin must call `itdb_spl_update_all` before `itdb_db_write`, or the iPod would show stale members.
- **Does not**: Nano 6G/7G (SQLite/iTunesCDB: `itdb_sqlite.c` has no smart-playlist code `[code]`) -> for these, save as a normal playlist.
  Rules on fields it does not evaluate are kept but not re-evaluated (we show them read-only).

### 1.3 Which fields does the iPod evaluate itself?
Unknown, and I could not prove it from the code (the firmware is closed). Apple's own behaviour `[bg]`: the iPod shows the member list stored
at the last sync; iTunes re-evaluates when play counts are synced back. Treat the iPod as **static**: our app re-evaluates and rewrites
whenever the iPod is open with *Allow changes* on, and says so ("Smart playlists are refreshed when you connect"). **One experiment on
the owner's real iPod settles it** (add to the task notes): a playlist "play count is 0, live updating" containing song X; play X on the
iPod to the end; unplug without syncing; does X leave the list? If yes, rules with play count / last played / rating / skip count are
re-evaluated on-device and worth preferring; if no, nothing changes in the design.

### 1.4 What the app writes
| Case | Written as |
|---|---|
| Rules only on fields libgpod evaluates, iPod with iTunesDB | **Real smart playlist** (prefs + rules + members from `itdb_spl_update`) |
| Rules on BPM (after "write detected BPM") | Real smart playlist, still |
| Rules on analysis features (key, energy, mood, "similar to") | **Normal playlist** with the computed members (+ our rules kept in the app's own file so it can be recomputed) |
| Nano 6G/7G | Normal playlist always |
| A genius result (seed + similar) | Normal playlist |
Plugin additions (API, small): `createSmartPlaylist(name, prefs, rules)`, `smartRules(id)` (read), `refreshSmart(id?)` (calls
`itdb_spl_update*`), `Track.bpm`, `Track.skipCount`, `Track.lastSkipped`, `update(id, {bpm})`. The sim (`ipod.sim.ts`) gets a small evaluator for the
test path.

---

## 2. How Genius worked, and Apple-free equivalents

### 2.1 Genius
`[bg]` iTunes Genius (2008): iTunes sends an anonymised description of the library (tracks, play counts, ratings) to Apple, which compares it
with millions of libraries; songs that co-occur in many libraries, weighted by play/rating, define "similar"; a playlist = the seed's
nearest neighbours that are in the *user's* library, ordered for variety. Genius Mixes = clusters of the user's library by the same
similarity. It is **collaborative filtering** (item-item co-occurrence); it needs the crowd, so we cannot copy it. Equivalent sources:

### 2.2 Sources compared
| Source | Gives | Licence / terms | Offline? | Cost on a Raspberry Pi |
|---|---|---|---|---|
| **(a) Local audio analysis** | tempo, key, loudness, energy, timbre, danceability proxy, optional embeddings; works for every file, even unknown music | our code on permissive libraries (section 3) | Yes | One-off decode + features: Mac M1 ~0.1-0.3 s/track `[est]`; Pi 4 ~1-3 s/track, Pi 3B+ ~3-8 s/track `[est]` (2,500 songs: 1-6 hours, background, resumable) |
| **(b) Metadata** | genre, year, artist, album, play count, rating, last played, skips, date added: the iPod database has all of them `[code: Track]` (skips and BPM to expose) | the owner's own data | Yes | Free |
| **(b2) Listening history** (Last.fm / ListenBrainz scrobbles) | far more than the iPod's counters: when, how often, over years, loved tracks | the user's own data; Last.fm API terms `[bg]`: personal use, own key, do not redistribute | Import needs the network once; then local | Import ~minutes; computing on the Mac |
| **(c1) ListenBrainz** | listens (own data, API or JSON export), **similar artists / similar recordings** (datasets from the MetaBrainz "labs" API, built from the listens of all users: the open collaborative filtering), recommendations by `troi` | server GPL-2; listens data and MusicBrainz core data CC0 `[bg]`; free API with rate-limit headers | No (optional, off by default) | Network only |
| **(c2) MusicBrainz** | MBIDs, canonical names/aliases, genres/tags, relations; helps matching and the ListenBrainz lookups | CC0 core data; 1 request/s per IP | No | Network only |
| **(c3) Last.fm** `artist.getSimilar`, `track.getSimilar`, `user.*` | collaborative similarity (this is the closest thing to Genius' crowd), tags, the user's scrobbles | API key is free, terms limit storage/redistribution of their data `[bg: check the current ToS before caching beyond the user's own data]`, not open | No (optional, off by default) | Network only; cache similar lists 30-90 days |
| **(c4) AcousticBrainz archive** | tempo/key/loudness/high-level classifiers (Essentia) per MBID, but the service closed in 2022 and the data is a static dump of old recordings (tens of GB) | CC0 data dumps `[bg]` | Dump offline | Not worth it: local analysis covers every file, the dump only the popular ones. **Skip**. |
**Policy.** Local analysis + metadata + own history are the core and need no account. (c) is a settings page "Use online data to improve
suggestions", off by default, with the name of each service and what is sent (artist and title names, never files).

---

## 3. Libraries scored

Facts about licences are `[bg]` unless `[V]`. Engine is permissive (MIT/BSD/zlib/ISC/PD/MPL-file-level fine; LGPL only as a loaded plugin; GPL/AGPL never linked).
Columns: fit3 perf3 size2 maint2 licence2 port1 effort1 = total /70.

| Candidate | Licence | What | f | p | s | m | l | po | e | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| **A. Thin extractor** on libebur128 + KissFFT/pocketfft + platform/miniaudio decode | MIT, BSD, PD | tempo (onset strength + comb/autocorrelation + octave folding), key (chroma + Krumhansl/Temperley profiles), loudness, spectral and MFCC statistics, energy | 5 | 4 | 5 | 3 | 5 | 5 | 2 | **60** |
| B. Essentia linked | **AGPL-3** (commercial licence exists) | everything, mature (3.8k stars, pushed 2026-10-22 `[V]`) | 5 | 4 | 2 | 4 | 1 | 3 | 3 | 47 (fails the licence rule) |
| C. Essentia `streaming_extractor_music` as a separate binary the user installs | AGPL, not shipped, not linked | JSON with bpm, key, loudness, danceability, ... | 5 | 3 | 5 | 4 | 4 | 2 | 4 | 56 as an **optional backend** |
| D. aubio (GPL-3) + libkeyfinder (GPL-3, needs FFTW GPL) | GPL | tempo/onset; key | 4 | 4 | 4 | 2 | 1 | 3 | 4 | 45 (fails) |
| E. ONNX Runtime (MIT, 10+ MB, a minimal build 1-3 MB) + Discogs-EffNet / MusiCNN embeddings | runtime MIT; **Essentia models CC BY-NC-SA 4.0** `[bg]` | 200-1,300 dim embeddings, genre/mood classifiers | 5 | 2 | 1 | 3 | 2 | 3 | 2 | 38 |
| F. Musly (dominikschnitzer/musly) | MPL-2.0 `[V]`, 148 stars, last push 2024-08 `[V]` | timbre similarity (Mandel-Ellis single Gaussian, KL distance), C++, bundles its FFT and resampler `[bg]` | 3 | 4 | 4 | 2 | 5 | 4 | 4 | 51 as a timbre-only component |
| G. libebur128 (jiixyj) | **MIT** | EBU R128 loudness (integrated, range, true peak) | 5 | 5 | 5 | 4 | 5 | 5 | 5 | **vendor** |
| H. Chromaprint (already vendored, MIT) | MIT | fingerprints only: identifies *the same recording*, not similarity; its chroma is internal | n/a | | | | | | | keep for duplicates and MusicBrainz lookups (AcoustID, optional) |
| I. Gist (adamstark) | GPL-3 `[V]` | audio features | | | | | | | | skip |
| J. bliss-rs (Polochon-street) | GPL-3 `[V]`, 168 stars, pushed 2026-08 `[V]` | 20 floats per song for playlist generation (tempo, zero-crossing, spectral centroid/rolloff/flatness, loudness, 10 chroma-based) | | | | | | | | **design reference** and **test oracle** (run its analyser beside ours, compare neighbour rankings); do not copy its code |
| K. libxtract / Marsyas / QM-DSP / madmom | libxtract ISC `[bg]` (small, old), Marsyas GPL, QM-DSP GPL-2, madmom code BSD but **models CC BY-NC-SA** | spectral features; beat tracking | | | | | | | | skip; revisit libxtract only if A's spectral code grows |

**The "never write a DSP engine" rule.** A writes *features*, not an engine: the FFT, the resampler (miniaudio's converter), the loudness
meter and the decoders are proven libraries; the new code is about 400-700 lines of statistics over their outputs (onset envelope,
autocorrelation of it, a chroma fold, a key-profile correlation, mean/std of bands), with test fixtures of known tempo/key/loudness
(section 6). This should be written as a decision record (D-number at the task, allocated by the coordinator).
Honest limits: simple autocorrelation tempo is right within 4% on perhaps 70-80% of pop/rock `[bg]` with frequent half/double errors; key
is exact on perhaps 60-70% with many neighbouring-key errors `[bg]`. The design absorbs both: tempo compared on a log2 axis with
octave folding, key compared by distance on the circle of fifths, confidences kept in the vector. If better accuracy is wanted later, swap
the tempo/key stage for a vendored neural beat model (the *Beat This!* MIT model `[bg]`, ONNX) behind the same interface.

**Decoding gap.** `[code]` `zinc:audio` `decode()` gives WAV/FLAC/MP3/Ogg (miniaudio, `number[]` per channel: a 4-minute track is
10M doubles, unsuitable for a library pass); `openMusic()` plays AAC/ALAC/MP3/WAV/AIFF on macOS only through AudioToolbox. The existing
fingerprint code decodes with `ExtAudioFile` to 11,025 Hz mono and is **macOS-only** (its comment: "a vendored decoder on Linux, later").
iPod libraries are mostly AAC/MP3/ALAC. So the analysis lives in the plugin's native code (like `ipod_fingerprint.cpp`): macOS =
ExtAudioFile to 22,050 Hz mono float; elsewhere = miniaudio for WAV/FLAC/MP3/Vorbis plus **a decision for AAC/ALAC** (candidates: Apple's
open ALAC decoder, Apache-2; a permissive AAC-LC decoder to be found; or, pragmatic, an `ffmpeg` binary found in `PATH` used as a pipe
`ffmpeg -i f -ac 1 -ar 22050 -f f32le -t 90 -`, a separate process). Until then Linux/Pi analyses MP3/FLAC/WAV and reports AAC/ALAC as "not
analysed here" (visible, not silent).

---

## 3b. Self-hostable tools and services (owner's addition)

The idea "use GitHub tools" splits into: **vendor** (permissive library in the plugin), **service** (a separate process the app or the
daemon talks to; this avoids linking GPL/AGPL but is not zero-setup and breaks the owner's single-app vision, so only optional), **skip**.

| Tool | Licence, state `[V]` unless noted | What | Weight / Pi | Verdict |
|---|---|---|---|---|
| **AudioMuse-AI** (NeptuneHub) | AGPL-3.0, 2.8k stars, pushed 2026-10-28, latest v3.6.4 (2026-10-16) | Sonic analysis (neural embeddings), clustering, similar songs, "instant playlists", song paths; plugins for Navidrome, Jellyfin, Lyrion, LMS, Emby, Plex; web UI | Docker compose (Flask API, workers, **PostgreSQL 15**, Redis) or, since v2.1.x, **native packages for macOS arm64, Linux x86_64/arm64 with embedded PostgreSQL**; README tests on a Pi 5 8 GB, Mac Mini M4 and says 8 GB RAM; not realistic on a Pi 3 | **Tier 2, optional service, off by default** (section 0b has the endpoint-by-endpoint contract): a "Use AudioMuse-AI at <url>" setting. Do not vendor (AGPL). It reads the music through the media server's API, so our daemon would act as one (below). Its models' licences (MusiCNN-type, `[bg]`) are the same non-commercial question as E. |
| **Musly** | MPL-2.0, 148 stars, last push 2024-08 | timbre similarity library; used by an LMS plugin (`lms-musicsimilarity`: GPL-3, 2 stars, last push 2022-07: abandoned) | small C++ | **Candidate to vendor** for timbre only if our MFCC statistics prove weak in the test plan; unmaintained, no tempo/key |
| **bliss-rs / bliss-analyser** | GPL-3 (168 / 21 stars, pushed 2026-08), **blissify-rs: no licence declared (48 stars)** -> unusable | song analysis for MPD/LMS playlists, 20 features per song | Rust binary, light | **Skip as code**; as an optional external analyser its SQLite output could be imported (low priority); main use: reference and oracle |
| **LMS (epoupon/lms)** | GPL-3 `[bg]` (repo path not verified today) | self-hosted music server with a Subsonic API and similarity from tags/features | server | Skip |
| **Navidrome** | GPL-3, 24k stars, pushed 2026-10-29 | Subsonic server; `getSimilarSongs`/`getSimilarSongs2` served by external agents (Last.fm, Spotify) `[bg]` | Go binary | Skip as a dependency. **Useful as a model: our daemon should answer `getSimilarSongs2`, `getRandomSongs`, `getStarred2`, `scrobble` from our own engine** so any Subsonic client (and AudioMuse) can use it |
| **Jellyfin "instant mix"** | GPL-2, 58k stars | metadata-based mix (genre, artist, album) `[bg]` | server | Skip; what it does we already get from metadata |
| **beets** + plugins | MIT, 15.9k stars, pushed 2026-10-28 | tagging; plugins `keyfinder` (calls the KeyFinder GPL CLI), `bpm`/`autobpm`, `xtractor`, `acousticbrainz` (dead since 2022) `[bg]` | Python | Not a dependency. **Read what it wrote**: BPM, `initial_key`, ReplayGain tags in the files via TagLib (already vendored) -> a free fast path when tags exist; use them before analysing |
| **Essentia `streaming_extractor_music`** | AGPL-3, 3.8k stars | the best open all-in-one extractor, JSON per track | binary ~ tens of MB; Pi: several s/track `[est]` | **Optional external backend** (setting "Use Essentia at <path>"), same feature vector, flagged "extractor: essentia" in the cache; never shipped |
| **ListenBrainz `troi`** | GPL-2, 166 stars, pushed 2026-09 | playlist generator (weekly jams, similar artists) on MetaBrainz data | self-hosting needs the whole LB stack (PostgreSQL + Timescale + big datasets): no | **Skip self-hosting**; call the hosted ListenBrainz API when online features are on |
| **Gist, aubio, KeyFinder, QM Vamp** | GPL | libraries | | skip (section 3) |
| **Voyager (Spotify, Apache-2 `[bg]`) / hnswlib (Apache-2) / Annoy (Apache-2)** | permissive | nearest-neighbour index | small | **Not needed**: brute force over <=30k tracks x 40 dims is ~1M multiplications per query (ms). Revisit above 100k tracks |

**What AudioMuse-AI would need from our daemon** (to verify by reading its `docs/NAVIDROME.md` and pointing it at a running daemon; I did
not run it): the Subsonic essentials with stable string ids: `ping`, `getMusicFolders`, `getArtists`/`getArtist`/`getAlbum`,
`getAlbumList2` (paged: `size`, `offset`, `type=alphabeticalByName`), `search3` (empty query paging), `getSong` (title, artist, album, path,
duration, genre, year, bitRate, `musicBrainzId` if known), `stream`/`download` with `id` (original file, byte ranges), `getPlaylists`,
`getPlaylist`, `createPlaylist` (`name`, `songId` repeated), `updatePlaylist`, `deletePlaylist`; token+salt or password auth; and
`getCoverArt` if it shows covers. The daemon's iPod files are the audio source, so analysis there is "stream each file once over the LAN".

**Recommendation.** Vendor: libebur128, one FFT (KissFFT or pocketfft). Maybe later: Musly (timbre), a neural beat model. Service
(optional, off): AudioMuse-AI, Essentia extractor, hosted ListenBrainz/Last.fm/MusicBrainz APIs. Skip: bliss/blissify, Gist, aubio,
KeyFinder, QM-DSP, troi self-hosting, Navidrome/Jellyfin/LMS as dependencies, AcousticBrainz dump. Own default stays: zero setup.

---

## 4. Design: analysis, similarity, Genius, mixes, rules editor

> Scope after the owner's two-tier decision (0b): 4.1-4.3 describe the full own extractor and are **not built now**. Tier 1 keeps only loudness (+ optionally tempo)
> from the vector and the metadata/co-listening terms of the distance; the deep half of the vector (key, chroma, MFCC, spectral) comes from AudioMuse when connected.
> 4.4-4.7 (Genius path, mixes, rules editor, preview and save) apply to both tiers unchanged.

### 4.1 Analysis pass (plugin native, `ipod.analyzeAudio()`)
- **Incremental.** Per track the key is `id size mtime` of the file (the same `fileKey` the duplicate cache uses `[code]`) plus the
  `algo` version; only new/changed tracks are analysed; a changed algorithm version recomputes only what it changed.
- **Cache.** `~/.zinc/ipod/cache/<FireWire GUID>/features.v1.bin` (+ a small `features.index.tsv` of keys; the duplicate finder's
  `hashes.txt`/`fingerprints.txt` live in the same per-iPod folder `[code: backupRoot()/folderKey(d)]`; the exact folder key
  (serial vs GUID) follows `folderKey`, which is the existing rule). Binary: float32 vector per track, written atomically, appended in
  chunks of 50 tracks so a killed run loses at most 50.
- **Resumable, background.** A job in Transfers ("Analyse sound of <iPod>"), progress `phase 'features' done/total detail`, cancel at any
  time; low priority thread; never touches the iPod (read only). One decoder at a time; the iPod's USB 2.0 read (~20-30 MB/s)
  is often the limit: read the file once into memory (5-10 MB) then process.
- **Window.** Decode up to 90 s starting at 25% of the track (skips intros/silence); loudness, tempo, key, spectrum are of that window (stated in
  the docs: "relative loudness, not the whole-track LUFS"). Tracks <30 s are analysed whole; audiobooks, podcasts and video are skipped.
- **Fast paths.** If the file has BPM / initial key / ReplayGain tags (beets, MixedInKey, Picard), take them (cheap, usually right)
  and skip those stages.
- **Where.** Where the files are: an iPod plugged into the Mac -> the Mac app; an iPod behind the Pi daemon -> the daemon analyses in
  the background and serves `GET /api/features` (the Mac does **not** pull whole files: 2,500 songs x 5 MB over Wi-Fi is 12 GB). The
  daemon version needs the AAC decision of section 3.

### 4.2 The feature vector (v1, about 44 floats, plus confidences)
`logTempo` (log2 bpm), `tempoConfidence`, `onsetRate`, `pulseClarity` (beat strength -> danceability proxy), `key` (0-23: tonic x mode) and its
confidence, `chroma[12]` (mean, key-normalised copy derived on the fly), `loudnessLUFS`, `loudnessRange`, `dynamics` (crest), `energy`
(derived: loudness + onset rate + spectral centroid), `centroid/rolloff/flatness/flux` (mean and std), `zcr`, `mfcc[13]` mean (+ std of the
first 5), `durationS`. Stored raw; the similarity normalises each group by its library statistics (z-score) so a small library and a
big one behave the same.

### 4.3 Similarity
`d(a,b) = sqrt( w_t·dTempo + w_k·dKey + w_c·dChroma + w_m·dTimbre + w_l·dLoud + w_e·dEnergy ) + w_meta·dMeta`, then
`sim = exp(-d)`.
- `dTempo`: min over {0, ±1 octave} of |log2 bpm_a - log2 bpm_b| (half/double tempo tolerated), scaled by the lower confidence.
- `dKey`: distance on the circle of fifths (relative major/minor counts as 0.5), 0 when confidence is low.
- `dTimbre`: Euclidean on z-scored MFCC mean/std and spectral stats; `dChroma`: cosine of key-normalised chroma.
- `dMeta`: 0 same artist and album, 0.3 same artist, 0.6 same genre, plus a year gap term; genre from the iPod tag, normalised.
- Default weights `t .20 k .10 c .10 m .35 l .05 e .10 meta .10`; **tuned on the fixture and the owner's library with a held-out check**
  (do the "my liked neighbours are in my top 25" test described in section 6). Stored in a small JSON so it can change without a code change.
- Index: dense float matrix, brute force. 30k tracks x 44 dims x one query ~1.3M multiply-adds. `[est]` <5 ms on a Mac, <60 ms on a Pi 4.

### 4.4 "Genius from this song"
Seed -> top 4*N candidates by `sim`, then a **greedy path** to N (25 default, up to 100): at each step choose the candidate maximising
`sim(seed, c) - λ_t·|Δlog2 tempo(prev,c)| - λ_k·dKey(prev,c) - repeat penalty` with the repeat penalty = same artist in the last 5 slots (hard
cap: no more than 2 songs per artist per 25, or 3 per 100) and same album in the last 8. Drift guard: also require `sim(centroid of chosen so
far, c)` above a floor, so the list does not wander away from the seed over 100 steps. Optional modes (toggles): "Keep the energy level",
"Build up" (tempo/energy slowly rising), "Wind down". Respect the user's data: skip tracks rated 1-2 stars, down-weight high skip rate,
exclude podcasts/audiobooks. Explanations ("same tempo, relative key, same era") are free from the distance terms and shown per row.

### 4.5 Proposed mixes (Genius-Mixes-like)
Cluster the *tracks the user plays* (weight = decayed plays + rating, or all tracks when there is no history) with k-means++ on the
whitened features + genre one-hot, k chosen 4..10 by silhouette on a sample, seeded for reproducibility; then each cluster gets a name from
its top genre/decade/artists/tempo ("Slow guitars, 70s-80s") and a mix of 25-50 tracks ordered by the greedy path. Deterministic given
the library and the seed (day), so the page does not reshuffle at every open.

### 4.6 Smart playlist editor (rules UI)
iTunes-like: "Match [all/any] of the following rules", rows (field popup -> action popup -> value editor: text / number / stars / date
with "in the last N days|weeks|months" / playlist popup), "+ / -", "Limit to N [songs|minutes|hours|MB|GB] selected by [...]", "Match only
checked songs", "Live updating" (means: re-evaluated by the app when it connects). Analysis fields (Tempo, Key, Energy, Loudness, Similar
to song X) appear in the same editor, marked with a tag "app only: saved as a normal playlist"; the editor shows live "N songs" and the
saved kind ("real smart playlist" / "normal playlist"). Evaluation in the app is the same code as libgpod's (one evaluator written in Zinc
over `Track` + features, tested against `itdb_spl_update` on the shared fields so the two never disagree).

### 4.7 Preview on the Mac, then save
Every result (genius, mix, rules) is a **draft playlist** in the app, playable through the app's existing queue (`services/player`, the
same queue the iPod songs use, by track id; the file is the iPod's own, read over USB or the cache) before anything is written. "Save to the
iPod" is a Transfers job behind *Allow changes* and the usual confirm: writes a normal playlist (`createPlaylist` + `setPlaylistTracks`)
or a smart playlist (1.4), takes a snapshot first (exists). Saved playlist names carry a marker the app can recognise ("Genius · Blue Hour")
and a sidecar file `~/.zinc/ipod/cache/<guid>/genius.json` keeps seed/params so "Refresh" regenerates it (new songs added, same shape).

---

## 5. "For you": a Spotify-style home

### 5.1 Data model (local, per user, on the Mac)
`~/.zinc/ipod/history/<service>-<user>.sqlite` (`zinc:sqlite`):
- `scrobbles(ts, artist, album, title, artist_mbid, album_mbid, track_mbid, loved, source)`, primary key `(ts, artist, title)`, so re-importing is idempotent.
- `pairs(key, artist_n, title_n, plays, first_ts, last_ts, loved, hour_hist[24], dow_hist[7], month_hist[...])`: one row per distinct normalised
  (artist, title), the unit all computing works on (50,000 scrobbles are ~15,000 pairs).
- `match(pair_key -> track_key, score, method)` per iPod GUID, where `track_key` is the iPod-independent normalised `artist|title|album`
  (follows the song to another iPod), plus the live `Track.id` resolved at open.
- `meta(user, last_import_ts, total_playcount_at_import, registered_ts)`.
Privacy: all local; credentials in `config.json` (mode 0600), never logged. Last.fm needs only the user's name and their own free API
key for read access to a public profile `[bg]`; we do not ship a shared key.

### 5.2 Importing Last.fm (once, then incrementally)
- `user.getInfo` -> total playcount and registration date (for the progress bar and the sanity check).
- `user.getRecentTracks&user=U&limit=200&page=N&extended=1&from=&to=&format=json` `[bg]`. 200 is the maximum. Fetch **newest first** with `to` fixed at the start of
  the import (a scrobble arriving during a 20-minute import would shift the pages); the checkpoint is "oldest timestamp seen so far",
  stored after each page so an interrupted import resumes with `to = oldest`. Skip the row flagged `nowplaying` (no date). `extended=1`
  gives `loved` and artist MBIDs.
- **Incremental**: later runs fetch with `from = last_import_ts + 1` (a handful of pages). Scrobbles edited/deleted on the Last.fm side
  are not seen by an incremental run: offer "Full re-import" (the table is replaced in one transaction).
- **Rate and errors**: be conservative, one request every ~0.5 s (Last.fm's guideline is about 5/s `[bg]`); on API error 29 (rate limit) or HTTP
  429/5xx exponential back-off with jitter, on 11/16 (temporary) retry up to 5 times; show "page 143 of 612" in Transfers; 100,000 scrobbles
  = 500 pages ~ 5-8 minutes `[est]`; the user can use the app meanwhile.
- `user.getTopTracks` / `user.getTopArtists` (periods overall, 12 month, 6 month, 3 month, 1 month, 7 day; `limit` up to 1000) and
  `user.getLovedTracks`: used as (a) a cheap first impression before the full history is in (the home page shows something after one
  request), (b) a check of the totals, (c) loved tracks if `extended` is not used. Not the source of truth: counts are aggregated, no time.
- Optional online enrichment: `artist.getSimilar&artist=A&limit=50` (match score 0-1) cached 90 days in `similar_artists` for the artists the user
  plays most; used by Discover. Off with "use online data" off.
- **ListenBrainz**: `GET /1/user/<name>/listens?count=<<=1000>&max_ts=<oldest>` `[bg]` (public profile, token optional; obey `X-RateLimit-*`
  headers and sleep until `Reset-In`), or an **offline import of the JSON export zip** from the user's LB settings page (no network at all);
  items map directly: `listened_at`, `track_metadata.artist_name/track_name/release_name`, `additional_info.recording_mbid/artist_mbids`.
  Same tables, `source='listenbrainz'`. If the user has both (LB can import from Last.fm), de-duplicate on `(ts±60 s, pair)`.

### 5.3 Matching scrobbles to the iPod's tracks (on distinct pairs only)
1. **MBID**: a scrobble's `track_mbid` equals a track MBID if the file carries `MUSICBRAINZ_TRACKID` (read with TagLib while analysing; the
   iPod database does not store it).
2. **Normalised exact** `artist_n|title_n`. Normalisation: Unicode NFKD, strip diacritics for the key, lowercase, `&` -> `and`, drop a
   leading `the `, remove bracketed/dashed suffixes `(feat. X)`, `[Explicit]`, `- Remastered 2011`, `- Live at ...`, `(Radio Edit)`, collapse
   punctuation and whitespace; artist also tried as album artist and as the first of `A & B`, `A feat. B`, `A, B`.
3. **Fuzzy** with a block on the first 3 letters of the normalised artist: `score = .55·title_sim + .35·artist_sim + .10·album_sim`
   (Jaro-Winkler on tokens sorted), accepted at >= .90 with a margin >= .03 over the second best; below that the pair stays unmatched.
   Duration is not in Last.fm's recent tracks, so it cannot arbitrate.
4. The match is stored with `score` and `method`; the page shows "Unmatched: 312 songs (1,904 plays)" with the top ones so the owner can fix a
   rule or add an alias. Unmatched scrobbles still count for the statistics (Top artists, Wrapped), they just cannot be played from the iPod.

### 5.4 The signals, and how each shelf uses them
Let for each iPod track `t`: `plays(t, window)` from the matched history (plus the iPod's own `playCount` delta since the last import,
which covers listening done on the iPod and scrobbled later or never), `lastPlayed(t)`, `skipRate(t)` (iPod `skipCount` / (plays + skips)),
`rating(t)`, `loved(t)`, `features(t)`, `genre/year`. **Affinity**
`aff(t) = 1.0·log1p(Σ plays·0.5^(age_days/90)) + 1.5·loved + 0.5·(rating-3) - 1.5·skipRate`, floored at 0. **Taste profile** `T` = affinity-weighted
mean of the features (per cluster too). Time of day: `hour_hist` smoothed circularly (+-1 h, weekday/weekend).

| Shelf | Rule | Signals |
|---|---|---|
| **Daily Mixes** (1..6) | the taste clusters of 4.5; per mix 50 tracks: 70% familiar (sampled by affinity within the cluster, not the top 50 every day) + 30% discovery (close to the centroid, plays <= 1); date-seeded; greedy path ordering | history, ratings, skips, features, genre |
| **Discover / Rediscover** | iPod tracks with plays 0-1 (or last played > 18 months ago), ranked by `mean sim to the top 200 affinity tracks` + artist affinity (same artist or `getSimilar` of an artist with high affinity) - skip penalty; at most 2 per artist; reason line "Because you play X" (the nearest high-affinity track) | features, history, optional Last.fm/LB similar artists |
| **On Repeat** | last 30 days, decayed with a 7-day half-life, top 30, only tracks with >= 3 plays | recency-weighted plays |
| **Repeat Rewind** | tracks that had >= 8 plays in some 30-day window older than 6 months and none in the last 90 days, ranked by peak x log(age) | full history per pair (month histogram) |
| **Time Capsule** | years 3-12 ago: top tracks of the year(s) the user listened most + songs with `year` in the same span that sound close (features) and are not played for a year; or "songs from <year>" by the track's release year | history, year tag, features |
| **Jump back in** | the last 8 distinct albums / playlists / artists played (sessions: a gap > 30 min starts a new one), as cover tiles | last_ts, session split |
| **Top songs / artists this month, year, all time** | counts per window from scrobbles (not only iPod tracks); tiles for those on the iPod are playable | history |
| **Because you listened to X** | X = one of the last 5 distinct heavily played tracks/artists; the Genius path from X (4.4), skipping the last-played-today | recent history, features |
| **For this time of day** | cluster with the highest mass in the current hour/day bin vs its overall mass (lift), 25 tracks; named "Evening" / "Weekend morning" | hour/dow histograms |
| **Loved but not on this iPod** | loved tracks unmatched (a list with the count; no promises about getting them) | loved flag |
| **Wrapped-like year view** | top 5 songs/artists/albums/genres, scrobble count and minutes (**estimate**: Last.fm has no duration; matched tracks use theirs, others the library mean), busiest day and hour (hour x weekday heat map), longest streak of days, new artists discovered this year, the first and the last song of the year, a "sound" summary (average tempo, energy, most common key and decade from the matched tracks) | history, features |
Every card has: play, "Save as playlist on the iPod" (4.7), "Why this?" (the signals). Everything is derived data: delete the `history`
folder and the page falls back to the iPod's own counters (plays, last played, rating, skips), with a prompt to import.

### 5.5 What runs where, and refresh
| Piece | Where | Refresh |
|---|---|---|
| Last.fm / LB import, `pairs`, matching | **Mac app** (credentials and history stay on the Mac) | on first setup; incremental on app start and every 30 min while the app is open, on "Refresh"; matching re-run when the iPod library changes (the library signature changes) |
| Audio features | where the files are: Mac plugin, or the **daemon** on the Pi (serves `/api/features`, `/api/tracks` with counters) | when an iPod opens: diff by `id size mtime`, queue new tracks; background, resumable |
| Taste profile, clusters, shelves, Genius | **Mac app** (cheap, JS over arrays) | recomputed when history, library or features change; the mixes are seeded by date so they are stable within a day and change at midnight; manual "Shuffle mixes" |
| Subsonic API of the daemon: `getSimilarSongs2`, `getRandomSongs`, `getStarred2`, `scrobble` | daemon | answered from the same engine; a remote Mac sees the same shelves |
| Online lookups (similar artists, MBIDs) | Mac app, only when enabled | cached 30-90 days, offline-safe |
With a **remote iPod** (daemon), the shelves work the same from `/api/tracks` + `/api/features`; playback of a draft goes through the existing remote-cache path.

---

## 6. Test plan without the owner's iPod

1. **Fixture audio** (a generator, `tools/` or inside the test, rendered by a Zinc program with `zinc:audio`'s `fromSamples`/ a WAV writer; deterministic):
   - tempo: kick+hat patterns at 70, 90, 100, 120, 128, 140, 174 bpm, 60 s each. Expect tempo within 3% of truth or of half/double (octave-folded), >= 90% of them exact on this clean signal.
   - key: sustained triad progressions in C major, A minor, F# minor, Eb major; chords synthesised from sine/saw partials. Expect exact key or its relative/fifth neighbour, exact on >= 75% of the clean set.
   - loudness: a 997 Hz sine at -20 dBFS on both channels = -23.0 LUFS (EBU Tech 3341 style); expect integrated -23.0 +- 0.2, and a -14 dBFS version at -17.0.
   - timbre/energy: a soft pad group and a noisy/bright group for the clustering test.
   - codecs: the same clips converted with macOS `afconvert` to AAC `.m4a` and ALAC, `lame` MP3 if present; features must stay within tolerance of the WAV (the decoder paths agree).
2. **Fixture iPod**: extend `tests/t0/ipod.sh`'s fake iPod folder (a `SysInfo` file `[code]`) with 24 generated tracks (4 tempos x 3 keys x 2 timbre groups), tagged with the genre/artist structure that lets us predict neighbours; `ZINC_IPOD_ROOTS` as for the other tests, `ZINC_NATIVE=sim` for the app test.
3. **Similarity / Genius**: seed = (128 bpm, A minor, bright); expect the top 8 neighbours to be the same group, a generated 25-track path with `|Δbpm| <= 10%` between neighbours and <= 2 per artist; clustering recovers the 2-4 planted groups (adjusted Rand >= 0.9).
4. **Smart playlists**: create `BPM between 120 and 130` + limit 10 by most recently added, run `itdb_spl_update_all`, save, reopen: members equal the expected set; rules are read back equal; a playlist with an unknown rule survives a save byte for byte (exists as a rule in the plugin `[code]`); Nano-7G-style fixture (SQLite) refuses the smart kind and writes a normal playlist. The JS evaluator is compared with libgpod's on a table of 40 rules (every field/action pair they share).
5. **Importers**: a local fake HTTP server (`zinc:net`) serving Last.fm-shaped JSON pages (now-playing row without date, a page that ends early, error 29 then success, `to` honoured, a scrobble added between pages, 3 pages incremental); a ListenBrainz export fixture. Idempotent re-import; resume after a kill at page 2. **No network in CI.**
6. **Matching**: a table of ~60 real-world variants (`feat.`, `- Remastered`, `The` prefix, accents, `&`/`and`, live suffixes, a cover with the same title by another artist that must **not** match, near-duplicates with a margin below .03 that must stay unmatched); precision >= 99%, recall >= 90% on the table.
7. **Shelves**: a synthetic history (generated, seeded) with planted behaviour (a band played heavily 3 years ago and not since, a song on repeat this week, a never-played track near a loved cluster): the golden JSON of the shelves is exact under `ZINC_DETERMINISTIC=1`.
8. **Resume/cancel/incremental analysis**: kill after 50 tracks, restart, no re-analysis of the first 50; touch one file, only it is re-analysed; algo version bump recomputes.
9. **AudioMuse contract tests**: a fake AudioMuse HTTP server replaying recorded `/api/sync`, `/api/similar_tracks`, `/api/find_path`, `/api/status` shapes (also error 401, 404 for a missing endpoint, a truncated page, ids unknown to the iPod); and a recorded request script of AudioMuse's Subsonic calls (section 0b) run against our Subsonic module on the fixture iPod: paging by `songOffset` to the end, `stream` byte-exact, playlists refused when Allow changes is off, `apiKey` and `u`/`p=enc:` auth.
10. **By hand, once** (not in CI): the owner's Last.fm import and the on-device live-update experiment of 1.3; the T1 session for the page.
Pi numbers (analysis seconds per track, import time, memory) are measured in the cross-platform pass and logged in `zinc-next-perf.md`.

---

## 7. Implementation batches, by tier (for the coordinator; backlog is frozen, the owner asked for it)

Each batch is one module, one commit per task, tests as in section 6.
- **A. Plugin basics (tier 1)**: expose `bpm`, `skipCount`, `lastSkipped`; smart playlists read/create/refresh (`itdb_spl_update_all` before write); sim evaluator; T0 test.
- **B. Rules editor + drafts**: smart playlist editor page, draft playlists, preview through the queue, save as normal or real smart playlist.
- **C. History (tier 1)**: SQLite store, Last.fm importer (paged, resumable, incremental), ListenBrainz API + export-zip importer, normaliser and matcher, "unmatched" list; fake-server tests.
- **D. Light similarity and Genius (tier 1)**: co-listening (session PMI), artist graph, genre/decade, optional loudness (libebur128 vendored, 60 s window) and optional tempo; Genius-from-song, taste clusters; weights JSON.
- **E. "For you" page (tier 1)**: all shelves of 5.4 except the deep ones; Wrapped view; refresh rules of 5.5.
- **F. Subsonic endpoint for AudioMuse**: one module serving the endpoints of 0b from the plugged iPod (Mac app, `zinc:net`) and from `examples/ipod-web` (the daemon); apiKey auth; read-only unless Allow changes; test against a recorded AudioMuse request script (the exact calls of the table) and, by hand once, a real AudioMuse native package.
- **G. AudioMuse client (tier 2)**: settings card, token test, start/poll/cancel as a Transfers job, `/api/sync` reader into `deep.v1.bin`, `/api/similar_tracks` and `/api/find_path` callers, merge rule 0b.1-4, offline/stale states; fake AudioMuse server in tests (recorded JSON shapes).
- **H. Cross-platform pass**: Pi daemon tier 1 (history, light features, AAC/ALAC decoder decision), measure seconds per track on Pi 3B+/4/5; AudioMuse over LAN from a Pi daemon.
Lines for `backlog/later.md`: cross-platform pass: Pi timings and the Linux AAC/ALAC decoder; later: Musly or a permissive neural beat model if tier-1 tempo
proves weak; read `MUSICBRAINZ_TRACKID` from files; optional AcoustID lookups with the vendored Chromaprint; Essentia extractor as another optional external backend.

## 8. Open points to verify (all `[bg]`/`[est]` above)
Last.fm current API terms (caching of similar data, rate limit); ListenBrainz page size and rate limits; ListenBrainz "labs" similarity endpoints' current names; licences of Essentia/Discogs-EffNet/MusiCNN models; AudioMuse-AI's exact Subsonic calls and model licences; the real iPod's on-device smart-playlist behaviour (1.3); Pi analysis speeds; accuracy of the tempo/key stage on the owner's library (the held-out neighbour test).
