# The Discord client's safety model (ZN-890)

`examples/discord` must never look like a bot or a flood to Discord: an account that does gets a captcha, a lock or a ban. The client
keeps to a person's pace with one system in one place, `examples/discord/src/safety/`, whose only entry point is `safety/index.ts` (the
guard). Every HTTP request (reads too), every gateway payload, every CDN download and every user action goes through it. The rest of the
app holds no limit, pace, timer or cooldown: it asks the guard and gets back *allowed*, *wait N ms (reason)* or *refused (message to
show)*, and the UI reads its countdowns and messages from the guard.

Owner decisions: the client does not imitate the official client's identity (no super-properties, user agent, build number, cookies or
fingerprint work), and never solves or bypasses a captcha. The model only keeps a real person's use inside Discord's limits.

## The module

| File | Holds |
|---|---|
| `safety/policy.ts` | The policy table: every number below (`RULES` per kind, the global caps, Discord's limits). Nothing else holds a number. |
| `safety/core.ts` | The pure logic, no clock and no network: sliding windows, `Budgets` (layer 3), `Spam` (layer 2), `Buckets` (Discord's route buckets), error classification. Tested alone by `tests/rate-limits.ts`. |
| `safety/access.ts` | What the account may do (layer 2): 64-bit permissions from roles and overwrites, timeouts, slowmode, blocked people, closed DMs, Nitro and boost limits, learnt from READY and the gateway events. |
| `safety/index.ts` | The guard: human origin, the verdicts, the cache and in-flight dedupe, the circuit breaker and safe mode, the gateway queue, IDENTIFY budget, reconnection, the single instance, quick-restart resume, presence. |

`services/rest.ts` and `services/gateway.ts` are transports: `rest.transport()` is called only by the guard, and the gateway's
socket is handed to the guard (`gatewayWire`), which sends every payload. `grep -rniE "cooldown|rate.?limit|per.?minute|retry|backoff"
examples/discord/src | grep -v src/safety/` finds nothing but comments pointing at the guard.

## How a request goes

```
action (key, click) -> guard.begin(kind, details) -> Verdict { ok | message, waitMs }
                       layer 1 human origin, layer 2 action guards, layer 3 budgets
Verdict ok -> guard.request(verdict, method, path, body) / guard.send(verdict, op, d)
                       layer 4 cache and dedupe, layer 5 breaker, Discord's buckets, then the transport
```

A verdict is spent by one request (or `uses` requests: the files of an upload) and expires after 60 s, so no code can reach the
transport without a fresh verdict. `guard.api(kind, ...)` does both steps for reads and background requests.

## Layer 1: human origin

A write (and every read but the picture refresh) is allowed only within `HUMAN_S` = 2 s of a real key or click, with the window in front:
`windowFocused()` and the system idle time (`zinc:system/power`, `idleSeconds() <= 2`; focus alone where the idle time is not known).
Nothing sent from a timer, a loop or startup passes. What follows a person's action without being one has its own kind with no human
check (op 4 after joining, Go Live's ops after the `live` click, the QR login's ticket once the phone confirmed); the login screen's first
QR code comes with the screen, and a new one only from a click on **New code**, never from a timer or a reconnection. There is no scripting surface: no CLI flag, environment variable, IPC or plugin hook
sends anything, and nothing is scheduled. The scripted demos and benchmarks (`DISCORD_DEMO`, `DISCORD_BENCH`) skip this layer and the
action gap only when `DISCORD_API` is `127.0.0.1` or `localhost` (`guard.allowScripts()`, the fake Discord of the tests); with the real
API they print why and do nothing. Even scripted, the caps, cooldowns and the quiet kinds' gaps hold.

Proved by: `tests/rate-limits.ts` (a send from a timer, i.e. no input for 5 s, is refused; a window not in front is refused).

## Layer 2: action guards

Checked before anything is sent, from what READY and the gateway said:

- **Permissions** (roles, `@everyone`, channel overwrites in Discord's order, administrator, owner, timeout): SEND_MESSAGES (or
  SEND_MESSAGES_IN_THREADS), ATTACH_FILES, ADD_REACTIONS for a new emoji, CONNECT and SPEAK (a call joins muted without SPEAK), the
  voice channel's user limit (MOVE_MEMBERS passes it). Unknown permissions (no member data) let the request go: Discord decides.
- **Slowmode**: `rate_limit_per_user` from the last send in the channel (MANAGE_MESSAGES and MANAGE_CHANNELS are exempt); the composer
  shows the countdown (`guard.countdown(channel)`).
- **Message**: 2000 characters (4000 with Nitro), 10 files, upload size 10 MB (50 MB Nitro Basic or Classic or a level 2 server, 100 MB
  level 3, 500 MB Nitro).
- **Blocked people and closed DMs**: no DM to someone blocked, no reaction to their message; a 403 code 50007 marks the DM closed and the
  composer says so instead of letting the person type.
- **Spam**: the same text (case, spaces and punctuation aside) is refused for 10 minutes in the same channel and pasted into another one;
  a short text (under 8 characters, "ok") only from its third time in a minute in one channel; more than 5 mentions or 3 links refused.
- **No bulk actions**: there is none in the app (no bulk delete, no mass DM, no friend-request list); `dm`, `friend`, `profile` and
  `search` have rules for when a code path comes. Invites and links open only from a click (`Content.tsx` `openUrl`).

Proved by: `tests/rate-limits.ts` (duplicate, cross-channel, ten-minute expiry, short-text rule, mentions, links; 64-bit permissions, an
overwrite, a timeout, unknown roles) and `tests/t1/discord_safety.sh` (read-only channel, blocked DM, slowmode with its countdown, a repeat
and a paste, six mentions).

## Layer 3: budgets, per kind and global

Each kind has a minimum interval, a cap a minute and a cap an hour (`policy.ts` `RULES`):

| Kind | Gap | /min | /hour | Human | Essential | Front | Quiet |
|---|---|---|---|---|---|---|---|
| send | 1 s | 10 | 300 | yes | yes | yes | |
| upload | 1 s | 5 | 60 | yes | yes | yes | |
| edit | 1 s | 10 | 120 | yes | yes | yes | |
| delete | 1 s | 10 | 60 | yes | yes | yes | |
| react | 0.5 s | 15 | 200 | yes | yes | yes | |
| vote | 1 s | 10 | 60 | yes | yes | yes | |
| pin (pin, unpin; only where `mayPin`: a DM, Manage Messages or Pin Messages) | 1 s | 5 | 30 | yes | yes | yes | |
| call | 2 s | 5 | 30 | yes | yes | yes | |
| ring | 5 s | 3 | 20 | yes | yes | yes | |
| dm | 5 s | 3 | 10 | yes | yes | yes | |
| friend | 10 s | 2 | 10 | yes | yes | yes | |
| live (Go Live, watching a stream) | 2 s | 5 | 30 | yes | yes | yes | |
| login (`/auth/login`) | 5 s | 3 | 10 | yes | yes | yes | |
| mfa (`/auth/mfa/*`) | 5 s | 3 | 10 | yes | yes | yes | |
| qr (a QR code: the remote-auth gateway opened) | 5 s | 3 | 20 | | yes | | |
| ticket (the QR login's token) | | 3 | 10 | | yes | | |
| stream (ops 18, 20, 22; op 19 always goes) | | 20 | 300 | | yes | | |
| typing | 8 s | 10 | 300 | yes | | yes | yes |
| ack | | 60 | 1500 | | | yes | yes |
| voice (op 4, with the camera's `self_video`) | | 20 | 300 | | yes | | |
| presence (op 3) | 60 s | 2 | 20 | | | | yes |
| subscribe (op 37) | | 30 | 600 | | | | yes |
| history | | 20 | 300 | yes | yes | yes | |
| older | 1 s | 10 | 200 | yes | | yes | yes |
| posts | 1 s | 10 | 100 | yes | | yes | |
| pins (a channel's pins opened) | 1 s | 10 | 100 | yes | | yes | |
| profile | 1 s | 10 | 100 | yes | | yes | |
| search | 2 s | 5 | 60 | yes | | yes | |
| refresh | | 10 | 200 | | | | yes |

All kinds together: 100 a minute, 1500 an hour. Going over a cap is a strike: a cooldown of 5 s for that kind (for every kind when the
global cap is hit), doubled each strike in a row up to 10 minutes, forgotten after 10 quiet minutes. The person sees "Slow down: wait N s."
and the countdown. A quiet kind (a background request) is refused without a strike: it waits for the next occasion. There is no op 14 or
op 8 (member lists) at all, and op 37 goes only for the channel on screen.

Proved by: `tests/rate-limits.ts` (human-paced sends pass; a burst gets a 5 s cooldown that holds, then 10 s; a scripted reaction burst
stops at 15; a loop of older pages goes at one a second) and `discord_safety.sh` (20 reactions: 15 go, then "Slow down: wait 5 s."; a loop
of 15 older pages: 1 asked).

## Layer 4: dedupe and cache

A GET answer is kept 30 s; the same GET asked again while one is in flight shares its answer. Histories, forum posts and pictures stay in
memory for the session; pictures and the last READY stay on disk. Pictures download 6 at a time, the latest asked first; expired picture
URLs are renewed 50 to a request. No request goes while the network is down: a failure backs off from 1 s to 60 s.

Proved by: `discord_safety.sh` (the loop of history pages reaches the fake once) and the `discord` showcase golden (each picture once).

## Layer 5: circuit breaker and safe mode

- Discord's route buckets (`X-RateLimit-*`) and the global 50 a second are waited for before a request goes.
- A 429 asking 10 s or less is waited and retried up to 3 times; a longer one, a 401, a 403 with 40002 or 50178, or a captcha
  (`captcha_key`) starts **safe mode** for 10 minutes and strikes the kind (a 429 strikes globally too): only essential kinds go (sends,
  edits, history of a channel opened); typing, acks, presence, older pages and picture URLs stop. A captcha is never shown or solved: the
  message says to log in with the QR code, or once in the official app. A 401 stops every request, closes the gateway and goes back to
  the login, whose kinds (login, mfa, qr, ticket) are the only ones that still go.
- Every 401, 403 and non-shared 429 counts; past 100 in 10 minutes (Discord bans an address at 10,000) nothing is sent until the window
  clears.
- Gateway: at most 110 payloads a minute besides the heartbeats (Discord closes above 120), the rest wait in order.

Proved by: `discord_safety.sh` (a captcha, then typing refused in safe mode; a 60 s 429, then a reaction refused "Slow down: wait"; a 401
sends the person back to the login and nothing more is sent).

## Layer 6: session hygiene

- **IDENTIFY**: one per 5 s, 50 a day (Discord: 1000), counted across launches in `zinc:storage`.
- **Reconnection**: RESUME first; backoff 1 s to 60 s with jitter; op 9 `d: false` waits 1 to 5 s, doubled each time in a row.
- **Quick restart**: at quit (window closed, Escape, SIGINT, SIGTERM) the session id, READY's sequence and the resume URL are saved and
  the socket closes with 4000 (resumable). A launch within 3 minutes, of a session at most 30 minutes old, reads READY back from the
  disk cache and RESUMEs from READY's sequence (Discord replays the events since), with no IDENTIFY. A logout closes with 1000 and
  forgets it.
- **One instance**: a second launch brings the open window to the front and quits (`zinc:system/instance`).
- **Presence**: idle after 10 minutes without input, online again on input, checked every 30 s, only when the status is online.
- **Typing** only while really typing; **acks** only for what the window in front shows.

Proved by: `discord_safety.sh` (a second launch resumes `sess-1` without IDENTIFY; a launch while the session runs says "already running";
op 9 re-identifies after 1 to 7 s with the day's count).

## Sources

Discord developer documentation, read 2026-10-30 (see `discord-client-requests.md` for the details): rate limits (global 50 a second,
invalid request limit 10,000 per 10 minutes), gateway (120 sends a minute, 1000 IDENTIFY a day, resume, op 9), opcodes and status codes
(40002, 50178, 50007, 40003), message length (2000, 4000 with Nitro), upload sizes, slowmode (`rate_limit_per_user`, exempt with
MANAGE_MESSAGES or MANAGE_CHANNELS), permissions (computing a member's permissions with overwrites). The per-kind caps for writes are not
Discord's numbers, which are not published: they are a fast person's pace (10 messages a minute, 15 reactions) with room above what a
person does, and they are the policy table's to change.
