# The Discord client's requests: an audit (ZN-886)

`examples/discord` is a light native client for people whose machines cannot run the Electron app. This audit lists every request it
makes to Discord, when and how often, and the safeguards that keep a person using it from tripping Discord's abuse limits by accident.
The scope is behaviour only: the client's identity (IDENTIFY properties, `X-Super-Properties`, User-Agent) is described in
`discord-client-research.md` and was not changed here. Nothing here tries to hide the client or get around a check.

Sources (Discord developer documentation, read 2026-10-30):

- Rate limits: <https://docs.discord.com/developers/topics/rate-limits> (per-route buckets and `X-RateLimit-*` headers, 429 body,
  global 50 requests a second, invalid request limit 10,000 per 10 minutes counting 401, 403 and 429 except `X-RateLimit-Scope: shared`).
- Gateway: <https://docs.discord.com/developers/events/gateway> (120 events per connection every 60 s, immediate disconnect above it;
  resume with `resume_gateway_url` after op 7, a resumable close or op 9 `d: true`; 1000 IDENTIFY in 24 hours; `max_concurrency` is
  identifies per 5 s; jitter so clients do not all reconnect at once).
- Opcodes and status codes: <https://docs.discord.com/developers/topics/opcodes-and-status-codes> (close codes and which reconnect,
  JSON codes 40002 "You need to verify your account in order to perform this action", 50178 "The user account must first be verified",
  40003 "You are opening direct messages too fast").
- The 1 to 5 s random wait after op 9 `d: false` comes from Discord's earlier gateway page; the current one says only to disconnect and
  identify. The client keeps the wait.

## Every request

### Gateway (`src/services/gateway.ts`, one WebSocket)

| Payload | When | How often |
|---|---|---|
| op 2 IDENTIFY | a new session: launch or login, after op 9 `d: false`, after close 4007/4009 | once per launch normally; at most 1 per 5 s and 50 a day per process (Discord: 1000 a day) |
| op 6 RESUME | every other reconnect (drop, op 7, zombie connection, op 9 `d: true`) on `resume_gateway_url` | per drop |
| op 1 heartbeat | every `heartbeat_interval` (about 41 s), first at a random point of it; and when the server asks | ~1.5 a minute |
| op 37 guild subscriptions | a server channel is opened: its first 100 member rows, typing, activities, threads | per channel switch, not again for the channel already subscribed on this session |
| op 4 voice state | joining, muting, deafening, leaving a call (person's action) | per action |

No op 8 (request guild members), no op 14 or bulk member paging, no subscription of channels that are not on screen.

### Remote-auth gateway (`src/services/auth.ts`, one WebSocket while the login screen shows)

`wss://remote-auth-gateway.discord.gg/?v=2`, with the web origin it requires: `init` (the public key), `nonce_proof`, `heartbeat` every
`heartbeat_interval`. Opened once when the login screen shows and closed when it is left; when the code expires (the gateway's
`timeout_ms`, about 2 minutes) or the phone cancels, nothing reconnects until **New code** is pressed.

### HTTP API (`src/services/rest.ts`)

| Endpoint | Who triggers it | How often |
|---|---|---|
| `GET /channels/{id}/messages?limit=50` | opening a channel for the first time this session | once per channel (kept in memory after) |
| `GET /channels/{id}/messages?before=..&limit=100` | scrolling to the top of a history | one page at a time, never two in flight |
| `GET /channels/{id}/threads/search?...&limit=25` | opening a forum | once per forum per session |
| `POST /channels/{id}/messages/{m}/ack` | opening an unread channel, messages arriving in the open one | only when unread; one per 300 ms burst; background |
| `POST /channels/{id}/typing` | the person types | at most every 8 s while typing (as the web client); background |
| `POST /channels/{id}/messages` | Enter, or files sent | per message |
| `PATCH`/`DELETE /channels/{id}/messages/{m}` | edit, delete (twice-clicked) | per action |
| `PUT`/`DELETE .../reactions/{emoji}/@me` | pressing a reaction or the thumb | per press |
| `PUT /channels/{id}/polls/{m}/answers/@me` | pressing a poll answer | per press |
| `POST /channels/{id}/attachments` | sending files | per message with files |
| `POST /attachments/refresh-urls` | pictures whose signed URL expired come on screen | one request for the pictures of a frame, 50 URLs each; background |
| `POST /channels/{id}/call/ring` | starting a DM call nobody is in | per call |
| `POST /auth/login` | **Log in** with email and password (ZN-869) | per press, never retried; a captcha answer is shown, not solved |
| `POST /auth/mfa/totp`, `/auth/mfa/sms/send`, `/auth/mfa/sms` | the two-factor step of that login | per press |
| `POST /users/@me/remote-auth/login` | the phone confirmed the QR code login (the ticket for the encrypted token) | once per QR login |

At startup the client makes **no HTTP API request**: READY carries the servers, channels, DMs, read states, settings and voice states.
Pictures (avatars, server icons, emoji, stickers, attachments) come from the CDN (`cdn.discordapp.com`, kept on disk) and the upload
`PUT` goes to the storage URL Discord gives; neither carries the token. No channel's history is fetched before it is opened.

## Safeguards

- **Per-route buckets**: `X-RateLimit-Bucket`, `-Remaining`, `-Reset-After` fill one bucket per route and major id; a request waits while
  its bucket is empty.
- **Global limit**: at most 50 requests in any second (sliding window, `services/limits.ts`).
- **429**: waits `retry_after` (the whole client when `global`), retries at most three times and only for waits up to 10 s; otherwise the
  error tells the person when to try again.
- **Invalid requests**: every 401, 403 and non-shared 429 is counted; past 100 in 10 minutes (Discord bans an address at 10,000) the
  client sends nothing until the window clears.
- **Safe mode**: a 401, a 403 with code 40002 or 50178, a captcha asked for (`captcha_key`/`captcha_sitekey`), or a 429 the client does
  not retry stops the background requests (typing, acks, picture URLs) for 10 minutes and shows a plain message; 429s are not retried in
  safe mode. A 401 stops every request, closes the gateway and goes back to the login. A captcha is never shown or solved here: the
  message says to do the action once in the official Discord app.
- **Gateway sends**: heartbeats always go; everything else goes while fewer than 110 payloads were sent in the last minute and waits in
  order otherwise (Discord closes a connection above 120).
- **Reconnection**: resume first; exponential backoff from 1 s to 60 s with jitter (50 to 100% of the step); op 9 `d: false` waits 1 to
  5 s, doubled each time in a row until a READY; close codes 4004 and 4010-4014 stop; 4007 and 4009 drop the session and identify.
- **One session per token**: a second login closes the open connection first; the token lives in the system keychain
  (`zinc:secure-store`), or `DISCORD_TOKEN` for tests.
- **No automated actions**: every send, edit, delete, reaction, vote, upload, call and ring comes from a press or a key. The scripted
  sessions (`DISCORD_DEMO=1|voice|showcase`, `DISCORD_BENCH=1`, which send, react, vote and page whole histories) run only when
  `DISCORD_API` points at `127.0.0.1` or `localhost` (the fake Discord of the tests); with the real API they print why and do nothing.

## Not done, and why

- **Resume across launches**: each launch identifies once, as the official client does; resuming a session from a previous process would
  need its sequence number saved at quit. One IDENTIFY per launch is far under the 1000 a day.
- **A second instance of the app**: two processes would hold two sessions; the app does not yet refuse a second instance.
- **Identify count across launches**: the 50 a day is per process.
