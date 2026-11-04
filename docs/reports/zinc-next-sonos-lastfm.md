# Sonos / Last.fm server port — 2026-10-31

Owner request: port `https://github.com/denya/sonos-lastfm.git` to a Zinc server app and improve it.

`app/sonos-lastfm` is a headless typed Zinc application. It uses the existing `zinc:sonos` plugin directly for discovery, topology and playback, plus HTTP, MD5 and filesystem APIs. The initial app-local Sonos reimplementation was removed at the owner’s request. No new dependency or native Sonos special case was added. MIT provenance and upstream revision/archive checksum are in its README.

The upstream implementation uses a default 25% position threshold, a 30-minute artist/title exclusion, submission-time timestamps and direct writes to two JSON files. This port uses observed playback, the Last.fm half-duration/four-minute threshold and >30-second rule, per-coordinator playback sessions with repeat detection, original session start timestamps and an outbox saved before submission. A seek earns no listening credit. Topology selects coordinators to avoid stale follower metadata. Last.fm delivery runs separately from monitoring, with bounded requests, retry backoff, revoked-session authorization and explicit handling of ignored scrobbles. Future timestamps and daily-limit responses stay pending; permanent ignored records remain inspectable.

Authorization uses Last.fm's browser token/session flow. No account password is requested or stored. State and session files are private; HTTP monitoring binds loopback, status requires a random bearer token, and secrets are not returned. A systemd user-service example is supplied but not installed. Run one instance per data directory.

A missing language operation was fixed at its shared checker: `String()` now lowers dynamic JSON values through the existing `__dynString` helper, matching the already supported dynamic `Number()` conversion. The app keeps ordinary TypeScript conversions instead of carrying an engine workaround. `dyn_string` proves strings, numbers, booleans, null, undefined, arrays and objects on interpreter/AOT/QuickJS.

Validation:

- `tools/build zinc`: passed after the one-line checker change.
- `build/zinc check app/sonos-lastfm`: passed.
- `ZINC=build/zinc tests/run --only dyn_string`: passed on interpreter/AOT/QuickJS.
- `ZINC=build/zinc tests/run --only sonos_lastfm`: local protocol fixture checks cover listening thresholds, pauses, seeks, repeats, short/unknown durations, restart progress, coordinator topology, nested XML entities, real HTTP/SOAP calls, API signatures, passwordless auth, HTTP failure, ignored records, revoked sessions, persistent state, corruption preservation and private permissions. The server smoke check compiles a standalone native app, verifies health/authenticated status, then terminates and checks saved state.
- Native application built at `build/sonos-lastfm` on the development Mac; about 3 MiB, linked only to libSystem/libc++.

Read-only discovery with `zinc:sonos` on the real LAN found two rooms in one group (seed 192.168.2.103). Real Last.fm account authorization/submission remains unvalidated. No NAS installation, service activation, cross-platform build, push or release. Systemd/Linux/NAS use remains to be verified in the cross-platform phase.

Limits are explicit in the app README: polling is conservative; topology changes can reset progress; a hard crash may lose up to 15 seconds of unqueued observations; rename is not an fsync power-loss guarantee. Remote acceptance followed by a lost acknowledgement can cause a retry duplicate, because Last.fm exposes no idempotency key. Running Spotify's own integration alongside this service can independently duplicate submissions. Queued/rejected records are not silently evicted; monitor disk usage.

Owner correction: app-local `src/sonos.ts` and its duplicate time parser were deleted. `main.ts` imports `System`, `Group`, `discover` from `zinc:sonos` and uses `System.update`. Feature fixtures now exercise the actual plugin. Last.fm JSON error codes are preserved across HTTP failures (notably HTTP 403 / API 14 while browser approval is pending); a regression proves this on all three engines. Authorization logs now expose the safe API/HTTP error code instead of hiding it behind “unavailable”.

Final real-LAN proof: both interpreter and native AOT discovery probes found 2 rooms / 1 group and successfully read current playback (`PLAYING`, duration 184 seconds, artist/title present) without issuing playback commands or scrobbles. Rebuilt `build/sonos-lastfm` reports plugins `socket, sonos` and is approximately 3.4 MB.

Live terminal logging (owner follow-up): each changed playback snapshot prints UTC time, room/group, state, artist/title/album, current position/duration, observed listening versus threshold, source and queued/accepted/rejected status. Repeated paused lines are suppressed. Unknown/short/missing metadata tracks explain why they do not scrobble. The feature check verifies formatted output on all engines and asserts an actual native server playback log against the fixture. Existing user process/session/data were not touched.

Owner logging correction: deduplicate on playback identity/session, room/group, transport state, source, metadata validity and delivery status, excluding position and accumulated listening time. Unchanged topology refreshes are silent too. Regression assertions cover silent progress and visible track, room, pause and delivery transitions. Monitoring continues internally; the terminal is an event log.

Readability pass (owner request): split configuration, Sonos monitoring, Last.fm delivery and HTTP status into concrete modules; `main.ts` now only assembles services and manages two independent loops/lifetime (74 lines). State belongs to the relevant monitor/delivery/logger instance instead of module globals. Expanded compressed declarations/control flow and replaced short bookkeeping names with domain names. Reused existing `zinc:web.toHex` and `URLSearchParams`; no new dependency, general-purpose utility framework or std module. Existing state schema, paths, CLI flags, HTTP payloads and event-only logs are retained; unknown/invalid CLI options now fail explicitly. Fixture checks additionally prove real delivery backoff/acknowledgement persistence and reject invalid CLI arguments and wrong HTTP bearer tokens.
