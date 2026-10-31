# The Discord client's requests: an audit (ZN-886, ZN-890)

`examples/discord` is a light native client for people whose machines cannot run the Electron app. This audit lists every request it
makes to Discord, when and how often, and the guard each one goes through so that a person using it never trips Discord's abuse limits by
accident. The guard, its six layers and every number are in `discord-safety-model.md`; this page is the inventory. The scope is
behaviour only: the client's identity (IDENTIFY properties, User-Agent) is described in `discord-client-research.md` and is not changed
(owner: no imitation of the official client, no captcha solving). Nothing here tries to hide the client or get around a check.

Sources (Discord developer documentation, read 2026-10-30):

- Rate limits: <https://docs.discord.com/developers/topics/rate-limits> (per-route buckets and `X-RateLimit-*` headers, 429 body,
  global 50 requests a second, invalid request limit 10,000 per 10 minutes counting 401, 403 and 429 except `X-RateLimit-Scope: shared`).
- Gateway: <https://docs.discord.com/developers/events/gateway> (120 events per connection every 60 s, immediate disconnect above it;
  resume with `resume_gateway_url` after op 7, a resumable close or op 9 `d: true`; 1000 IDENTIFY in 24 hours; `max_concurrency` is
  identifies per 5 s; jitter so clients do not all reconnect at once).
- Opcodes and status codes: <https://docs.discord.com/developers/topics/opcodes-and-status-codes> (close codes and which reconnect,
  JSON codes 40002 "You need to verify your account in order to perform this action", 50178 "The user account must first be verified",
  40003 "You are opening direct messages too fast", 50007 "Cannot send messages to this user").
- The 1 to 5 s random wait after op 9 `d: false` comes from Discord's earlier gateway page; the current one says only to disconnect and
  identify. The client keeps the wait.

## Every request

Every request below goes through `examples/discord/src/safety/index.ts`; the last column is its kind in the policy table
(`safety/policy.ts`). `services/rest.ts` and `services/gateway.ts` only carry what the guard lets through.

### Gateway (`src/services/gateway.ts`, one WebSocket)

| Payload | When | How often | Guard |
|---|---|---|---|
| op 2 IDENTIFY | a new session: first launch or login, after op 9 `d: false`, after close 4007/4009 | once per launch normally; at most 1 per 5 s and 50 a day across launches (Discord: 1000 a day) | `identify()` |
| op 6 RESUME | every other reconnect (drop, op 7, zombie connection, op 9 `d: true`) on `resume_gateway_url`; a launch within 3 min of the last quit | per drop | `protocol()`, `reconnectDelay()` |
| op 1 heartbeat | every `heartbeat_interval` (about 41 s), first at a random point of it; and when the server asks | ~1.5 a minute | `heartbeat()` (always goes) |
| op 37 guild subscriptions | a server channel is opened: its first 100 member rows, typing, activities, threads; the member list scrolled to another hundred: the ranges on screen (3 at most) | per channel switch, not again for the channel already subscribed on this session; per hundred of rows scrolled to | subscribe |
| op 4 voice state | joining, muting, deafening, the camera on or off (`self_video`, ZN-873), leaving a call (person's action) | per action | voice (leaving: `leave()`, always goes) |
| op 18 stream create, op 20 stream watch | **Go Live** after the share dialog, pressing someone's stream (ZN-875) | per press | live (the click), then stream |
| op 22 stream set paused | our stream's own connection is up | once per stream | stream |
| op 19 stream delete | stopping our stream or the one watched | per stop | `leave()` (always goes) |
| op 3 presence | idle after 10 min without input, online again on input | at most 2 a minute | presence |

No op 8 (request guild members), no op 14 or bulk member paging, no subscription of channels that are not on screen. Every payload but
the heartbeats waits in the guard's queue while 110 were sent in the last minute.

### Remote-auth gateway (`src/services/auth.ts`, one WebSocket while the login screen shows)

`wss://remote-auth-gateway.discord.gg/?v=2`, with the web origin it requires: `init` (the public key), `nonce_proof`, `heartbeat` every
`heartbeat_interval`. Opened once when the login screen shows and closed when it is left, each opening under a `qr` verdict (one per 5 s,
3 a minute, 20 an hour); when the code expires (the gateway's `timeout_ms`, about 2 minutes) or the phone cancels, nothing reconnects until
**New code** is pressed.

### HTTP API (`src/services/rest.ts`, called only by the guard)

| Endpoint | Who triggers it | How often | Guard |
|---|---|---|---|
| `GET /channels/{id}/messages?limit=50` | opening a channel (or a thread beside it) for the first time this session; **Jump to present** after a jump far back | once per channel (kept in memory after) | history |
| `GET /channels/{id}/messages?before=..&limit=100` | scrolling to the top of a history | one page at a time, at most one a second | older |
| `GET /channels/{id}/threads/search?...&limit=25` | opening a forum | once per forum per session | posts |
| `GET /channels/{id}/messages?around={m}&limit=50` | following a reply to a message older than the loaded page | once per message (the page joins the list, or replaces it until **Jump to present**) | history |
| `GET /channels/{id}/messages/pins?limit=50` | opening the pins of a channel | once per channel per session; again only after someone else pinned there (CHANNEL_PINS_UPDATE) | pins |
| `PUT`/`DELETE /channels/{id}/messages/pins/{m}` | **Pin** / **Unpin**, offered only in DMs or with Manage Messages or Pin Messages (the guard's permissions) | per press | pin |
| `POST /channels/{id}/messages/{m}/ack` | opening an unread channel or thread, messages arriving in the open one while its end shows, scrolling back to its end | only when unread and in front; one per 300 ms burst | ack |
| `POST /channels/{id}/typing` | the person types | at most every 8 s while typing (as the web client) | typing |
| `POST /channels/{id}/messages` | Enter, or files sent | per message | send |
| `PATCH`/`DELETE /channels/{id}/messages/{m}` | edit, delete (twice-clicked) | per action | edit, delete |
| `PUT`/`DELETE .../reactions/{emoji}/@me` | pressing a reaction or the thumb | per press | react |
| `GET /gifs/trending-gifs?media_format=mp4&provider=tenor&locale=..` | opening the GIF picker | once per session (kept in memory) | gifs |
| `GET /gifs/search?q=..&media_format=mp4&provider=tenor&locale=..` | typing in the GIF picker, once it pauses 400 ms | once per query per session (kept in memory) | gifs |
| `POST /channels/{id}/messages` with `sticker_ids`, or a GIF's link | a sticker or a GIF picked | per pick | send |
| `PUT /channels/{id}/polls/{m}/answers/@me` | pressing a poll answer | per press | vote |
| `POST /channels/{id}/attachments`, then the storage `PUT`s | sending files | per message with files | upload (one verdict for all its requests) |
| `POST /attachments/refresh-urls` | pictures whose signed URL expired come on screen | one request for the pictures of a frame, 50 URLs each | refresh |
| `POST /channels/{id}/call/ring` | starting a DM call nobody is in | per call | ring (the join itself: call) |
| `POST /auth/login` | **Log in** with email and password (ZN-869) | per press, never retried; a captcha answer is shown, not solved | login |
| `POST /auth/mfa/totp`, `/auth/mfa/sms/send`, `/auth/mfa/sms` | the two-factor step of that login | per press | mfa |
| `POST /users/@me/remote-auth/login` | the phone confirmed the QR code login (the ticket for the encrypted token) | once per QR login | ticket |

`dm`, `friend`, `profile` and `search` have rules in the table but no code path: the app opens no DM, sends no friend request, fetches no
profile and searches nothing yet.

At startup the client makes **no HTTP API request**: READY carries the servers, channels, DMs, read states, settings and voice states.
Pictures (avatars, server icons, emoji, stickers, attachments, the GIF picker's previews and the GIFs that play, from Tenor's media server) come from the CDN (`cdn.discordapp.com`, kept on disk, 6 downloads at a
time through `guard.download`) and the upload `PUT` goes to the storage URL Discord gives; neither carries the token. No channel's history
is fetched before it is opened: no prefetch, no crawl, no polling.

### User actions without a request

Links and invites open only from a click (`Content.tsx` `openUrl`), never by themselves. There is no bulk action anywhere (no bulk
delete, no mass DM, no friend-request list, no scheduled send). The scripted sessions (`DISCORD_DEMO=1|voice|showcase|safety|restart`,
`DISCORD_BENCH=1`) run only when `DISCORD_API` points at `127.0.0.1` or `localhost`, the fake Discord of the tests; with the real API
they print why and do nothing. No CLI flag, environment variable, IPC or plugin hook sends a message.

## Safeguards

In `discord-safety-model.md`, by layer: human origin; action guards (permissions, slowmode with a countdown, length and upload size,
blocked people and closed DMs, spam); budgets per kind and global with escalating cooldowns; dedupe and cache; circuit breaker and safe
mode (route buckets, global 50 a second, 429 retries, invalid-request cap, captcha and 401 handling); session hygiene (IDENTIFY budget
across launches, resume across a quick restart, one instance, idle presence).

## What is left

- The voice gateway and its UDP media (`plugins/discord-voice`) are paced by the plugin, not by this guard: that includes the camera's and
  Go Live's op 12 (video sources) and op 15 (media sink wants), which go on the voice server's own connection, not the main gateway.
- The single instance is per app, not per account: two accounts cannot run at once on one machine.
- A quick restart replays every event since READY (READY is not replayed by Discord): a session open for 30 minutes replays at most that.
