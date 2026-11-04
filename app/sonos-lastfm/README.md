# Sonos → Last.fm, in Zinc

A headless Zinc server that watches Sonos directly, including music started through Spotify Connect. It uses the existing `zinc:sonos` plugin for discovery, topology and playback. No Python, Node, Spotify API or Last.fm password. Run it on a machine on the same LAN as the speakers.

## Code map

`src/main.ts` assembles the application and manages its lifetime. Each other file has one job:

| File | Responsibility |
| --- | --- |
| `config.ts` | CLI arguments and configuration validation |
| `monitor.ts` | Read `zinc:sonos` and record eligible listens |
| `tracker.ts` | Count observed playback and detect repeats |
| `lastfm.ts` | Last.fm HTTP requests and signing |
| `delivery.ts` | Browser authorization, session persistence and outbox retries |
| `store.ts` | Read, validate and save listening state |
| `log.ts` | Log meaningful changes without progress spam |
| `server.ts` | Loopback health/status routes and their admin token |

Hex encoding and form encoding use `zinc:web`'s `toHex` and `URLSearchParams`. CLI validation and status routes are app-specific. The current std does not expose a high-level CLI parser, async sleep or token-comparison helper; these needs do not introduce a new generic utility layer here.

## Start on the development Mac

Create a free [Last.fm API key and shared secret](https://www.last.fm/api/account/create). From the Zinc repository:

```sh
export LASTFM_API_KEY='your key'
export LASTFM_API_SECRET='your shared secret'
build/zinc run --interp app/sonos-lastfm -- --data /tmp/sonos-lastfm-data
```

Use a permanent private data directory for everyday listening; `/tmp` is only for a first try. Open the authorization URL printed in the terminal and approve the application. The server obtains and saves its session automatically; no callback server or password entry is needed. `LASTFM_SESSION_KEY` can supply an existing session instead. A revoked session triggers fresh browser authorization.

The working directory defaults to the app directory. `--data` defaults to `data` there; use an absolute path when specifying it. The data directory is mode 700 and its files mode 600. Keep API secrets in environment variables or a private service environment file. `.env.example` is a template; the app does not automatically load `.env`.

If multicast discovery cannot reach your speakers, provide any reachable speaker's address:

```sh
build/zinc run --interp app/sonos-lastfm -- \
  --data /absolute/path/sonos-lastfm-data --sonos http://192.168.1.50:1400
```

`--sonos` also accepts the plugin’s native `ip:1400` address format.

`--interval 2` sets the polling interval in seconds (1–15). `--port 8792` sets the local monitoring port. Only run one instance against a given data directory. A second instance on the same monitoring port fails before it starts monitoring.

## Native executable

On the development Mac, build a standalone server with:

```sh
build/zinc build app/sonos-lastfm -o build/sonos-lastfm
build/sonos-lastfm --data /absolute/path/sonos-lastfm-data
```

The API environment variables are the same as above. A built executable uses its launch directory for relative paths.

## What is better than the original

- Scrobbles after **half the track or four minutes of observed playback**, whichever is shorter. Tracks of 30 seconds or less, unknown durations and missing artist/title are skipped. The original defaults to 25% and uses playback position.
- Pauses, seeks and gaps between observations earn no listening time. Normal advances earn only the time observed. A new track starts a new session; an end-to-start wrap allows a repeat without the original's 30-minute artist/title ban.
- Watches the **coordinator of each Sonos group**, avoiding the stale metadata returned by grouped followers. Independent groups have independent listening sessions.
- A private, persistent outbox records eligible listens **before sending** and retains their original start timestamps. HTTP/API failures retry oldest first with exponential backoff (5 seconds to 15 minutes). Sending runs independently of Sonos monitoring, so a Last.fm outage does not stop recording.
- Checks Last.fm's acceptance count, not just HTTP success. Permanent ignored records and invalid scrobble parameters move to a visible rejected list. Future timestamps and daily limits remain queued for retry.
- Browser authorization replaces username/password storage. A local HTTP status API, periodic checkpoints and SIGINT/SIGTERM shutdown make it usable as a service.

Listening progress is checkpointed every 15 seconds and on clean shutdown; an abrupt crash can lose up to that interval of unqueued progress. Eligibility and acknowledgements are saved immediately. State is replaced by same-directory rename; invalid state refuses startup rather than discarding history. This is not an fsync-backed power-loss guarantee. A crash or timeout after Last.fm accepted a request but before the acknowledgement was saved can cause a duplicate on retry: Last.fm provides no idempotency key. Missing Sonos observations are deliberately not reconstructed as listening time.

The server can only record playback while it runs. Polling can miss very short interruptions and cannot perfectly distinguish a deliberate seek across the end/start boundary from a repeat. Radio and line-in without duration are skipped. Topology refreshes every 60 seconds; regrouping or coordinator changes can interrupt a listening session. Now-playing is best effort and one Last.fm account can display only one current track.

## Live terminal log

The terminal prints only meaningful changes: a new track or repeat, pause/resume/stop, source or group changes, and Last.fm delivery status. Advancing playback position and accumulated listening time produce no additional lines. Unchanged topology refreshes are also silent. Each playback event includes the group/rooms, artist, title, album, current position/duration, observed listening versus the scrobble threshold, source and UTC time. Internal polling continues to measure listening; current progress remains available through `/status`.

```text
14:35:20 UTC [Living room + Kitchen] PLAYING | Artist - Song | album: Album | 1:08/3:04 | listened 0:42/1:32 to scrobble | source: spotify
```

Once eligible, the log says `Last.fm: queued for delivery`, then `Last.fm: scrobbled` after acceptance. The server also prints successful now-playing updates and explicit reasons when a track cannot scrobble (unknown duration, short track, missing metadata). Position and observed listening are deliberately separate: starting the server mid-song or seeking forward earns no credit for unheard time. Logs contain listening history; keep redirected log files private.

## Monitor

The HTTP server binds **127.0.0.1 only**. No public admin interface or write endpoints.

```sh
curl http://127.0.0.1:8792/health
curl -H "Authorization: Bearer $(cat /absolute/path/sonos-lastfm-data/admin.token)" \
  http://127.0.0.1:8792/status
```

`/health` reports process readiness, authorization, discovered group count and queued count. Readiness means the service initialized, not that speakers or Last.fm are reachable. `/status` adds groups, current listens, pending/rejected records, acknowledged count and the latest diagnostic. It never returns API credentials or session keys. Inspect a remote server through an SSH tunnel rather than exposing this port.

Data files: `session.key`, `admin.token`, `state.json`. Back up the whole directory. The outbox/rejected list is retained without automatic eviction to avoid silently losing listens; monitor disk usage during a prolonged outage. A persistent configuration error can hold the oldest entry pending; check the logs and credentials. If Spotify's own Last.fm integration resumes, running both scrobblers may produce duplicates; this service cannot inspect or deduplicate Spotify's separate submissions.

## Run as a background service

`deploy/sonos-lastfm.service` is a **systemd user-service example** for a checkout at `~/zinc`. Adjust the paths, put the API variables from `.env.example` in `~/.config/sonos-lastfm.env` (mode 600), and copy the unit to `~/.config/systemd/user/`. Then:

```sh
systemctl --user daemon-reload
systemctl --user enable --now sonos-lastfm
journalctl --user -u sonos-lastfm -f
```

Open the authorization URL from the log on your usual computer. The server must stay on the Sonos LAN. For Docker/NAS deployment, multicast usually needs host networking; a known `--sonos` address avoids multicast discovery. There is no automatic installation or modification of system services.

Only macOS has been tested in this change. The systemd unit is supplied for deployment, not claimed as Linux validation. No cross-platform build is part of this port.

## Checks and provenance

```sh
build/zinc check app/sonos-lastfm
ZINC=build/zinc tests/run --only sonos_lastfm
ZINC=build/zinc tests/run --only dyn_string
```

The feature check runs tracking, plugin discovery/topology/playback, API signatures, passwordless authorization (including HTTP 403 with API error 14), acceptance/error handling and persistent state checks on the interpreter, native AOT and QuickJS against local fixtures, plus an actual standalone native server build/startup/status/shutdown check. It does not submit to a real Last.fm account. A separate read-only LAN smoke check using the plugin discovered two rooms in one group on the development Mac.

Port and redesign of [denya/sonos-lastfm](https://github.com/denya/sonos-lastfm), MIT, Denis Moskalets. Reviewed upstream tree: `00820bc5b0480c38b9fbc4aec015e2bebe6a96c9`; downloaded source archive SHA-256: `2c9307f37a243e2ea53b0509a2fdf2859111d1209378215a44a129d2e2c9d08b`. Original notice: [LICENSE.upstream](LICENSE.upstream). The Python implementation and its dependencies are not bundled.

Protocol references: [Last.fm scrobbling](https://www.last.fm/api/scrobbling), [authentication/signing](https://www.last.fm/api/authspec), [track.scrobble](https://www.last.fm/api/show/track.scrobble), and [SoCo](https://github.com/SoCo/SoCo) for Sonos SOAP/topology behavior. The `zinc:sonos` plugin provides all Sonos communication; the app adds Last.fm authentication, listening accounting and its persistent outbox. There is no app-local SSDP, SOAP or metadata parser.

For a read-only check of the actual Sonos LAN:

```sh
ZINC_HEADLESS=1 build/zinc run --interp tests/data/sonos-lastfm/discover.ts
```

Last.fm API errors are decoded even when their HTTP status is 403, so an authorization still awaiting browser approval remains pending rather than being reported as an unavailable service. Other authorization failures now print their actual API/HTTP code.
