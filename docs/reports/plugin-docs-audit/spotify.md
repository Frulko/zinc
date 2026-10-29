# zinc:spotify documentation audit

## What it is
Browse your Spotify library (playlists, albums, liked songs, recents, search) and start playback on a Spotify Connect device (a Sonos room, a computer) from a Zinc app. One login, then the plugin refreshes tokens by itself.

## Targets and status
plugin.json: pure Zinc, targets macos, linux, windows, android, ios, rpi1, rmpp; `requires: net, fs`. Doc: macos verified; webOS/TouchPad built; rpi1/rmpp manifest only. Android login delivery is an open problem (backlog line 462).

## What the docs have
- [x] overview, [x] one-time login steps (very clear), [x] in-app login (`Login`), [x] expiry and rotation notes, [x] example, [x] API tables for `Spotify` and data classes, [x] notes (Dev Mode limits, Sonos restricted devices), [x] report `docs/reports/spotify-web-api.md`
- [x] runnable use: `examples/music`, `examples/music-tree` (8 files)
- [ ] test named (none; only indirect `music_tree_sonos`/`music_city_standby`)
- [ ] screenshots; [ ] tutorial with screenshots of the Spotify dashboard steps; [ ] offline/mock mode; [ ] troubleshooting

## What is missing (priority)
1. Document the exported API the page skips: `find`, `findMore`, `artist`, `artistAlbums`, `artistTracks`, `album(id)`, `playlist(id, offset)`, `Item.thumb/artistId/durationMs/year`, `sharedLoginFile()`, `Login` fields (`url`, `status`, `error`), `Spotify.clientId/file/userId/reload/logout`.
2. A mock Spotify (fake `fetch` server) so the quick start and tests run without Premium/an app (tests: none today). (owner) decides scope.
3. Tutorial with screenshots of developer.spotify.com steps: create app, redirect URI `http://127.0.0.1:8765/callback`, run `login.py`, check `ready()`. (owner) for screenshots of the dashboard.
4. Screenshots of `examples/music` using it (library list, now playing).
5. Troubleshooting table: `login expired` (six months), 403 for restricted Sonos device, Dev Mode allowlist (5 users, Premium), TLS 1.3 retry quirk (backlog line 170), port 8765 taken.
6. Security note: where `$ZINC_HOME/spotify.json` lives, mode 0600, do not commit; revoking at spotify.com/account/apps.
7. Android/iOS login story once solved (backlog 462).
8. Rate limit and paging recipe (limit 50, offsets).

## Wrong or stale
- "needs the `net` and `process` permissions" vs plugin.json `requires: ["net", "fs"]`; the code needs `fs`, not `process`.
- "Test. None yet." (no direct test; indirect coverage exists).
- Python 3 is a prerequisite for `login.py` but is not listed under requirements for Windows users (plain `python`).
- "verified on x86_64".
- API table says `search` gives 10 of each and `me()` must be called before liked songs; check against `likedTracks` code if the userId rule still holds.

## Suggested pages
- Spotify: overview and quick start
- Spotify: tutorial, create a Spotify app and log in
- Spotify: API reference (generated)
- Spotify: playback on Connect devices (and Sonos)
- Spotify: limits of Development Mode
- Spotify: login on devices (TouchPad, Android)
- Spotify: examples (music, music-tree with screenshots)
- Spotify: security and troubleshooting
