# AudioMuse-AI setup (2026-10-29)

Owner request: AudioMuse-AI on the Mac so the iPod app can use sonic analysis, similar songs and playlists. Setup in `~/.zinc/audiomuse/` (compose, `.env`, `README.md`, `logproxy.py`). Containers are stopped.

## Installed

- AudioMuse-AI **3.6.4** (release 2026-10-16), image `ghcr.io/neptunehub/audiomuse-ai:3.6.4` (arm64, 2.1 GB pulled, 4.36 GB on disk) + `postgres:15-alpine`. No Redis (the queue lives in Postgres). Tag has no `v`: `3.6.4`.
- Compose: postgres (512 MB limit), flask (1.5 GB), one worker (3 GB). Upstream runs two queue processes in the worker image (`high`, `default`); there is no concurrency env var, so one worker container it is. Ports: only `127.0.0.1:8000`. `restart: "no"`.
- Memory measured: idle flask 22-100 MB, worker 135-155 MB, postgres 15-36 MB; during analysis the worker used one core at about 98% CPU, RAM under 300 MB. Volume `postgres-data` 50 MB after the fixture.
- Everything except Postgres and TZ is configured through the Setup Wizard / `POST /api/setup` and stored in Postgres. Login `zinc` / `zinc-audiomuse-ui`, API token `zinc-audiomuse-token` (local only).
- Disk warning: the data volume of the Mac had 12 GB free at start and 7.6 GB after; the image is 4.4 GB.

## Commands for the owner

    cd ~/.zinc/audiomuse && docker compose up -d                       # UI: http://127.0.0.1:8000  (zinc / zinc-audiomuse-ui)
    # clean slate (the DB still holds the 6 fixture tracks and points to the test proxy port 8698):
    docker compose down -v && docker compose up -d
    # the daemon on the real iPod (YOUR step; nothing here ever touched it). Listens on all interfaces, so containers reach it:
    cd /Users/mowmow/Lab/zinc && ZINC_BACKGROUND=1 build/zinc run examples/ipod-web -- --port 8686 --token <T> --user audiomuse --password muse1 --mount "/Volumes/IPOD DE LAL"
    # then the Setup Wizard: Navidrome, http://host.docker.internal:8686, audiomuse / muse1 (or the curl in the README), then
    curl -X POST http://127.0.0.1:8000/api/analysis/start -H 'Authorization: Bearer zinc-audiomuse-token' -H 'Content-Type: application/json' -d '{"num_recent_albums":0}'
    docker compose stop                                                # when done

Note: the daemon cannot start on the current tree (see "Problems", point 1).

## Subsonic endpoints AudioMuse calls (vs the daemon), captured with a logging proxy

AudioMuse uses its "Navidrome" type for any Subsonic server; auth `u`+`p` (plain), `f=json`, `v=1.16.1`, `c=AudioMuse-AI`, paths with `.view`.

| Endpoint | When | Result |
|---|---|---|
| `search3` (`query=` empty, `songCount=100`) | wizard "test connection" (probe_count 6) | pass |
| `getAlbumList2` (`type=newest&size=500&offset=0`) | start of analysis | pass |
| `getAlbum` (`id=al-N`) | per album, twice | pass (fields id, title, artist, album, path, suffix, duration, genre... present) |
| `stream` (`id=tr-...`) | download of each track | pass (200, full file, WAV) |
| `getLyricsBySongId` | per track after analysis (lyrics step) | FAIL: Subsonic error code 0 "getLyricsBySon..." (not implemented). Harmless: analysis finished SUCCESS, 6/6 tracks |
| `createPlaylist` (POST; `name=..._instant&songId=..`) | AudioMuse `POST /api/create_playlist` | FAIL: error code 0 (not implemented / read only) -> AudioMuse answers 502 error_code 1106 |
| Not exercised, in AudioMuse's code | clustering playlists, cleanup, top songs | `getPlaylists`, `getPlaylist`, `updatePlaylist`, `deletePlaylist`, `getSong`, `getMusicFolders`: check the daemon has `getPlaylist(s)`, `getSong`, `getMusicFolders` (it does per docs); `createPlaylist`, `updatePlaylist`, `deletePlaylist` are missing: needed only if AudioMuse must write playlists back to the iPod daemon |

Missing for the coordinator: `getLyricsBySongId` (OpenSubsonic; optional, can answer an empty `lyricsList`), `createPlaylist`, `updatePlaylist`, `deletePlaylist`. In search results AudioMuse shows `album_artist: "unknown"`: the daemon's songs carry no `albumArtist`; add `albumArtist` to the song (and album `artists`/`displayAlbumArtist`) if that matters. The app can keep playlists itself and only use AudioMuse for ids.

## AudioMuse API for the app (base `http://127.0.0.1:8000`, header `Authorization: Bearer <API_TOKEN>`; item ids are the Subsonic ids, `tr-...`)

- `POST /api/analysis/start` body `{"num_recent_albums":0,"top_n_moods":5}` -> 202 `{"status":"NEW","task_id":"...","task_type":"main_analysis"}`.
- `GET /api/status/<task_id>` -> `{"state":"SUCCESS|RUNNING|FAILURE|...","progress":100,"status_message":"Albums 3/3","details":{"albums_completed":3,"tracks_analyzed":6,"failed_albums":0,"log":[...]},"running_time_seconds":243.4}`. Also `GET /api/active_tasks`, `GET /api/last_task` (same shape with `status`), `POST /api/cancel/<task_id>`.
- `GET /api/search_tracks?title=Slow&artist=` (either may be empty) -> `[{"item_id":"tr-f77...","title":"Slow Pulse","author":"Tone Band","album":"Sines","album_artist":"unknown"}]`.
- Similar songs: `GET /api/similar_tracks?item_id=tr-f77...&n=5[&eliminate_duplicates=true]` (or `title`+`artist`) -> `[{"item_id","title","author","album","album_artist","distance":0.188,"mood_vector":"electronic:0.633,...","other_features":"danceable:0.57,...","top_genre","top_mood"}]`, nearest first (smaller distance = closer). Verified: 6 tracks, 3 returned for n=5 (per-artist cap and index size).
- `POST /api/create_playlist` `{"playlist_name","track_ids":["tr-.."]}` writes to the media server with Subsonic `createPlaylist` (fails against the daemon today, see above).
- `POST /api/clustering/start` (e.g. `{"clustering_method":"kmeans","num_clusters_min":2,"num_clusters_max":3,"clustering_runs":10}`) -> 202 task id, same status endpoint; result playlists are read with `GET /api/playlists` and created on the media server. Tried on the fixture: task FAILED with "only 6 clusterable tracks available" (needs `MIN_PLAYLIST_SIZE_FOR_TOP_N`=20 analysed tracks). Not proven beyond that. Also available: `/api/find_path`, `/api/similar_artists`, `/api/sonic_fingerprint/generate`, `/api/alchemy`, interactive docs at `/apidocs/` (after web login).

## Chain test

Fixture iPod (6 synthetic 40 s WAV tracks, 3 albums, made with ffmpeg and `zinc:ipod` like `tests/t1/ipod_web.sh`) under a scratch folder, daemon on port 8697 behind the logging proxy on 8698, AudioMuse configured by `POST /api/setup`: connection test OK, analysis SUCCESS (6/6 in 243 s), search and similar songs OK. Fixture daemon and proxy stopped, no process left, containers stopped.

## Problems met

1. **The daemon does not compile on the current tree/binary**: `examples/ipod/src/services/scrobble.ts:66` `names.sort();` -> `Z0104 Wrong number of arguments: expected 1, got 0` (`Array.sort()` without comparator is an engine gap; reproduced with a 1-line program on `build/zinc` and on another tree's build). I ran an unmodified-except-that-line copy in the scratchpad (`names.sort((a, b) => ...)`); the repo is untouched. Needs an engine fix (per AGENTS.md: fix the engine) before the owner can run the daemon.
2. `docker pull ghcr.io/...` answers `denied: denied` for every ghcr.io image on this Mac (daemon-side, also with an empty `DOCKER_CONFIG`; Docker's stored ghcr credentials look stale or the OrbStack proxy interferes; I did not touch the credentials). Workaround used: fetched the arm64 manifest and layers from ghcr with an anonymous token via curl, built a docker-archive tar and `docker load`ed it (OCI layout was refused). Upgrades may need the same, or `docker logout ghcr.io` by the owner.
3. Image tag is `3.6.4` not `v3.6.4`.
4. Analysis speed is CPU-bound (about 40 s per 40 s fixture track); a real library needs hours.
5. The daemon logs no requests; the logging proxy (`~/.zinc/audiomuse/logproxy.py`) was used for the capture.
