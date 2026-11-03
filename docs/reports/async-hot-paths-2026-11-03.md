# Sequential awaits on hot paths (2026-11-03)

All the findings below were fixed on 2026-11-03; "Applied, and what changed from this list" at the end says how. An AST scan of the TypeScript and JavaScript sources, leaving out `tests/`, found 363 candidates (198 runs of adjacent awaits, 165 awaits in loops). Each was triaged, and the callers of the findings traced. Findings 1 to 6 and 9 were read a second time in the source; the others rest on one reading by the triage agent.

## What was measured

Seven fetches against a local server with a 100 ms delay, on the `build/zinc` of 2026-11-02:

| Engine | Serial | `Promise.all` |
|---|---|---|
| Interpreter | 735 ms | 108 ms |
| Native (`--native`) | 733 ms | 106 ms |
| QuickJS | 746 ms | 106 ms |

`Promise<void>[]` and `.map(async ...)` work on all three. Every other gain below is an estimate, not a measurement.

## What concurrency can and cannot help

- **Concurrent:** `fetch` and `zinc:net` (measured), `fs.readTextAsync` and `fs.writeTextAsync` (libuv thread pool, read in the source, not measured).
- **Pipelines:** CDP calls in the inspector (`app/inspector/model.ts:98`): ids and a resolver map on the client, every complete frame handled per poll on the server.
- **No gain:** `zinc:ipod` runs on one `zrt::Jobs` worker, strictly in order. Only batch calls or fewer calls help. The `async` functions of `plugins/secure-store` are sync underneath.

## Rule for every fix

Use `Promise.all`. Do not start a promise and await it after another await: if it rejects while the other is pending, it counts as unhandled, which ends the program with 101 (D83).

## Tier 1: runs on a timer or on each selection

| # | Where | Trigger | Serial now | Fix | Estimated gain |
|---|---|---|---|---|---|
| 1 | `plugins/sonos/index.ts:403` `readVolumes` | 1 s while the volume popover is open; every 4 s through #3 | 2 calls per room, room after room | `Promise.all` over rooms, volume and mute together | 2M round trips to about 1 |
| 2 | `plugins/sonos/index.ts:356` `update` | 2 s poll, 400 ms after each command | 7 SOAP calls to one speaker, none using another's result | Start all 7, `Promise.all`, then fill the fields as today | 7 round trips to 1 or 2 |
| 3 | `examples/music-tree/src/state.ts:557` `pollAllRoomVolumes` | 4 s on the Rooms page and rings slide | `readVolumes` then `update`, group after group: about 51 calls for 6 groups and 8 rooms | Per-group task, at most 3 groups at once; keep the per-group `try`; hold the group in a `const` | About 51 round trips to 3 to 8 |
| 4 | `app/inspector/elements.tsx:302` `readStyles` | Each selection, including arrow keys | 4 round trips, 5 the first time | `Promise.all`, then assemble | 4 turns of the loop to 1 |
| 5 | `app/inspector/model.ts:55` `discover` | 1 s `setInterval` | One fetch per port: a slow forwarded port delays the ports behind it | `Promise.all` per port, flatten in port order, keep the stale-file removal per port | (ports - 1) x latency when a port is slow, about 0 on refused ports |

## Tier 2: runs on a user action

| # | Where | Trigger | Fix | Estimated gain |
|---|---|---|---|---|
| 6 | `examples/ipod/src/services/audiomuse.ts:254` `fetchNear` | For You refresh, Genius | Waves of 4 through `Promise.all`; keep the not-found `catch` in each task and `writeDeep` in `finally` | 20 seeds from several seconds to about 1 s |
| 7 | `examples/music-tree/src/state.ts:424` `discoverSonosSystem`, `examples/music/src/main.ts:232` | Startup, rediscovery | `Promise.all` over groups, at most 3 | About 35 to 50 calls to 3 to 6 round trips, with #2 |
| 8 | `app/inspector/main.tsx:247` `attach`, with `loadDocument` and `loadStorage` | Each attach, each `zinc dev` save | `Runtime.enable` stays first, the rest together, the re-selection last | About 11 turns to 3 |
| 9 | `examples/discord/src/services/upload.ts:26` `uploadFiles` | Sending files | `Promise.all` of `storagePut`, then build `out` in order; at most 10 files (`FILES_MAX`) | Sum of the uploads to the longest; about nothing on a saturated uplink |
| 10 | `app/markdown/src/state.ts` `fetchPictures`, `app/markdown/src/notion.ts:78` `blocks` | Sync button | Pictures at most 4 at once; block children at most 3 (Notion allows about 3 requests a second) | About a third of the time on nested pages |

## Tier 3: one round trip each, in passing

- `plugins/spotify/index.ts:272` `playlist`: playlist and items together. Keep the `catch` for items.
- `examples/music-tree/src/services/spotify-on-sonos.ts:63` and `:236`, `examples/music/src/main.ts:377` and `:418`: the Sonos and Spotify polls together.
- `app/inspector/info.tsx:128` `loadInfo` (1 s tick), `app/inspector/sources.tsx:72` and `:98` (scopes and watches at each pause), `app/inspector/storage.tsx:124` (deletes).
- `examples/ipod/src/services/ipod.ts:106` `readLibrary`, remote branch: tracks, playlists and specs together. `marker()` must stay first (its comment says why).
- `examples/ipod/src/services/ipod.ts:64` `openRemote` reads `/api/devices`, then `cachedLibrary` or `readLibrary` reads it again: pass the result along.
- `app/web-relay/src/main.ts:218` `show`: skip the three emulation calls when nothing changed.
- `app/hub/src/state.ts:122` `syncIcons`: at most 4 at once. Whether its hashing leaves the main thread was not checked.

## Needs a native batch call, not `Promise.all`

- `examples/ipod/src/services/ipod.ts:105` (`readLibrary`, local), `examples/ipod-web/src/services/library.ts:125` (`load`): one `ipod.snapshot()`.
- `examples/ipod-web/src/services/api.ts:140` (`update`): `ipod.updateMany(ids, patch)`.

The saving is the hops through the job queue, not parallelism. Its size is unknown: measure before doing this.

## Keep these serial

- **Sonos:** transport and queue sequences, paged browsing, the settle sleeps after a command, `LatestRequestQueue`.
- **iPod:** `prefetchCovers` (a deliberate throttle), Last.fm loops (rate limit), `examples/ipod-web/src/services/satellite.ts:109`.
- **Discord:** `refreshAll` (REST rate limits), QR login, already-concurrent channel-switch loads.
- **Web and std:** `targets/web/hmr.js` (import order), `lib/std/acme.ts`, the long poll of `targets/web/runtime.js`.
- **Inspector:** `refreshBox`, `screenAt` (coalescing on purpose), write-then-read style edits.

## Not proven

- Seven simultaneous requests to one real Sonos speaker: try #2 on the real speakers and on the TouchPad before keeping it. If a speaker struggles, cap at 4 or read Actions, Settings and GroupMute every Nth tick.
- `plugins/sonos/index.ts:860` already has UPnP event subscriptions. Whether music-tree could use them instead of these polls was not examined.
- C++ code is outside this scan.

## Side notes

- The comment at `plugins/sonos/index.ts:404` says a `for...of` with an await and a field write fails with Z0108. A minimal program with that shape compiled and ran on the interpreter and native, so the comment looks stale.
- `examples/ipod-web/src/services/api.ts:122`, `playlist`, must stay in order: a native `createPlaylist(name, ids)` would save one hop, on a cold path.

## Applied, and what changed from this list

- **Engine gap:** `const [a, b] = await Promise.all([pa, pb])` was refused when the types differ (Z0103). It now works on the three engines, up to six promises, destructured or as a statement (`tests/t1/promise_all_mixed.sh`). `const r = await Promise.all([pa, pb])` with `r[0]` is still refused for mixed types: it needs the checker to tell an array from a tuple.
- **iPod, corrected:** "no gain" above is wrong for the wait. The worker still runs one call at a time, but sending them together removes one turn of the event loop per call. So no native `snapshot()` or `updateMany` was added: `Promise.all` over the calls keeps their order on the queue.
- **Spotify, a defect the fix would have exposed:** two calls finding an expired token each refreshed it, and Spotify rotates refresh tokens. `Spotify.call` now shares one refresh.
- **Notion:** read-ahead of children keeps to 3 requests a second, Notion's limit, so the gain is small on a slow network.
- **`app/web-relay` `show`:** the three calls run together; they are not skipped when nothing changed, because a restarted Chrome loses them.
- **Not changed:** `enumerateDevices` (cold), Spotify `preload` (deliberately gentle on old devices).
- **Measured on a real Sonos system (one group of 3 rooms):** `update` 32 to 40 ms, `readVolumes` 34 to 50 ms after a first read of 1014 ms, no failure in 3 rounds. The TouchPad was not tried.
