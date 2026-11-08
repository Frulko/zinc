---
id: ZN-1037
title: 'iPod daemon: parity with the Mac app for a remote iPod'
status: Backlog
assignee: []
created_date: '2026-11-07 16:38'
labels:
  - ipod
  - size-M
  - demo
milestone: m-15
dependencies: []
ordinal: 1029000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ipod-web (the Pi daemon) lacks what the Mac app does locally: a remote iPod shows the volume name, smart playlists, lyrics and covers cannot be written, uploads are held in memory, /api is open to containers. Close the gaps the later.md lines list (D178 and iPod daemon lines).

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- D178: ipod-web's `/api/devices` gives the volume name, not the iPod's (the master playlist's), so the Mac app shows "ZINCPOD" for a remote iPod; `/api/add` takes no media kind (a podcast added remotely keeps the file's tags); photos and notes are not served.
- D178: ipod-web streams uploads to disk instead of holding the whole body in memory (`req.rawBody`), so a Pi with little RAM takes large files from the page.
- D178: ipod-web honours `size` for covers (scale or a cache per size), and a test of `/api/eject` on a fake disk image; the Subsonic methods getArtist, getSong, getPlaylist, search2, getAlbumList, getUser, getStarred and scrobble have no test yet.
- iPod demo: the remote mode's JSON parse throws on a missing Track/Playlist field, so an older daemon without bpm/rules breaks the Mac app; default missing fields.
- iPod daemon: examples/ipod-web/zinc.json declares only net; reading iPod_Control and writing the cache need fs, which an exported daemon would refuse (before zinc build on the Pi).
- iPod daemon: --log-requests masks query parameters only, not a POSTed form body.
- iPod daemon: OrbStack containers reach it as 127.0.0.1, so without --token /api is open to any container; require --token when the request comes through a container gateway, or document it loudly.
- iPod daemon: serve /api/genius and /api/mixes from services/genius.ts.
- iPod daemon: no smart playlist API (create, set rules, refresh), so the app refuses Save on a remote iPod; add it and enable Save there.
- iPod demo: the Info window cannot send a cover to a remote iPod (the daemon needs a cover upload route); an album grid on screen keeps the old cover until shown again.
- iPod daemon: no lyrics nor cover writes for a remote iPod yet (a writeLyrics route, a cover upload for artworkFile); both refuse with a clear error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `/api/devices` returns the iPod name (master playlist), `/api/add` takes a media kind, uploads stream to disk
- [ ] #2 A rules route lets a remote iPod save a smart playlist; routes for lyrics and cover upload; /api/genius and /api/mixes served from services/genius.ts
- [ ] #3 The Mac app tolerates missing Track/Playlist fields of an older daemon
- [ ] #4 `size` honoured for covers; --log-requests masks a POSTed form body; --token required through a container gateway; zinc.json declares fs
- [ ] #5 tests/t1/ipod_web.sh covers /api/eject on a fake image and the Subsonic methods named in the lines
<!-- AC:END -->
