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
ordinal: 17400
updated_date: '2026-11-12 12:55'
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
- [x] #3 The Mac app tolerates missing Track/Playlist fields of an older daemon
- [ ] #4 `size` honoured for covers; --log-requests masks a POSTed form body; --token required through a container gateway; zinc.json declares fs
- [ ] #5 tests/t1/ipod_web.sh covers /api/eject on a fake image and the Subsonic methods named in the lines
<!-- AC:END -->


## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
### AC3 — older daemon wire compatibility (2026-11-12)

Only AC3 is complete; status stays Backlog and AC1/2/4/5 stay open. The remote JSON boundary now accepts the later Track additions and Playlist.rules as optional wire fields, then returns the existing complete public models. Core identity, path and original daemon fields remain required; malformed types, explicit nulls, roots, lists and rule records still fail. No catch-and-empty fallback or public signature change.

Defaults preserve explicit false, zero and empty strings. Missing checked is true, matching historical include-all behavior and the real simulator constructor, rather than the inert table placeholder. Missing mediaBits uses the exported MEDIA_TYPES/MEDIA_BITS mapping (unknown kind: zero). The current daemon serializer now emits both checked and mediaBits so nondefault checked state and combined media flags survive same-version roundtrips.

Missing ordinary rules use ipod.emptyRules(). Missing smart rules set refreshable/liveUpdate false and preserve daemon trackIds. Source audit confirms whyNotEditable hides the edit button and shows a read-only explanation, playlistTracks uses those ids, no remote refresh endpoint/caller evaluates the fallback, and saveSmart refuses remote before enqueue/native writes. Unknown supplied clauses stay unchanged. readLibrary constructs PodLibrary only after every remote read resolves; snapshot writing follows construction.

Research already supplied in main .logs/research-next-k.txt: ECMAScript JSON.parse semantics (https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse) and Protobuf field-presence guidance (https://protobuf.dev/programming-guides/proto3/) support an explicit wire adapter that distinguishes absence from default values. No new dependency.

Authentic feature proofs were run by the engine prerequisite worker against these unchanged production sources and in-memory net responses; this finishing worker audited and copied the proofs, did not rerun them. Copies are under .logs/final-1037/engine-proofs/:

- production1037-stage6: full production decoder PASS interpreter, QuickJS and actual native (10 C++ units, link/run native, no interpreter fallback). Omissions, canonical media flags, explicit values, unknown additions, wrong/null types, required core fields, malformed roots/lists/rules, opaque rules and ordinary 403 checked. This stage later stopped on sender timeout124; there is deliberately no whole-stage PASS summary. Wire results alone are counted.
- production1037-consumer-stage6: actual production readLibrary consumer PASS all three engines, native 9 units/link/run. A valid old payload succeeds; a malformed second track with a nonempty marker rejects before library publication or application cache write, prior library unchanged and isolated backup paths absent. Original Mac app check PASS103 files (inherited album icon warning).
- production1037-sender-1127-stage1: exact production trackEl/playlistEl using real zinc:xml PASS all three engines, actual native 7 units/link/run. All nondefault current fields and opaque rules roundtrip unchanged.
- production1037-web-1127-stage1: unchanged original ipod-web check PASS18 files within the bounded30s run. Earlier current60s/OLD90s global timeouts remain authentic historical failures; fluent checker fix ZN-1127 resolves the observed chain, without splitting application chains.

Wire/consumer compiler SHA256 dd5c1e73c89a1468bf860bfe74a943f853b2a2fe4435abf259e35ec03d33a4f1; sender/web compiler 8fb03ae2ff442a5d0958cf86b9d11f08457acf240a8c894bfbeed0584fa097de. All63 compiler/adjacent-module/archive identities per stage are recorded in compiler.json. Native app/key/inputs/provider metadata are retained; plugins[] proves no hardware method was exercised. Before/after622-source manifests were fully reverified, as were fixture/production body identity and frozen native app hashes. Stable engine archive: main .logs/archive-completed-workers-20261110/1124-1127-boundaries-final/worker-logs/ retains the full compiler artifacts and all historical stages; root-proof/ retains coordinator common-build/T0/sender verification. Engine fixes1125/1126/1127 are prerequisites, integrated by coordinator in87adfb949; this older app branch is not an independent compiler release.

Limits/provenance: initial original net-fake dependency was overwritten before hashing; baseline-replay is a labeled reconstruction, never an original preserved artifact or replayed proof. Authentic initial failure log and original remote source survive in .logs/remote1037/. Intermediate1125 CLIcaf3 bytes were also lost before freezing (engine handoff); their logs/native artifact survive. No daemon/network/socket/device/database/application-cache write, UI session, OS service, build, suite/T1/T2/demo/pixel/conformance/fuzz/benchmark/CI or performance claim in this finishing pass. Whole .logs, failures and exact source blobs are retained for coordinator archive before cleanup.

Remaining work: AC1 streaming needs a real incoming request stream sink (Request exposes rawBody/rawBytes only); no buffered fake completion. AC2 mutation routes, AC4 cover/security/permissions and AC5 named T1 coverage remain unchanged. No new task or shared metadata edit.

Proposed tests:
- Owner-selected bounded current/older daemon end-to-end Mac app fixture, including read-only smart membership and malformed later rows; ~10–30s after compile, memory unmeasured. Existing tests/t1/ipod_web.sh stays unselected.
- Owner-selected existing ipod_web eject/Subsonic session for AC5, after the remaining implementation; duration/memory unmeasured, no suite run here.
<!-- SECTION:NOTES:END -->
