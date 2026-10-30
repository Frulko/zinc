# A native Discord client in Zinc: protocol research

Date: 2026-10-30. Scope: what a Zinc program (no browser, no Electron, in the spirit of discord-lite) must implement to be a user-account Discord client: login, gateway, text REST, notifications, voice, DAVE end-to-end encryption, video and Go Live.

## 0. Read this first

**Terms of Service.** Discord forbids third-party clients on user accounts ("self-bots" and modified clients). Dissent says it plainly: "Using an unofficial client at all is against Discord's Terms of Service and may cause your account to be banned." Abaddon says third-party clients "tend to upset the spam filter more often". discord-video-stream warns that automation can lead to a permanent ban. The bot API (bot tokens, official intents, official docs) is the only supported path, and it cannot do video or Go Live. Everything below is reverse-engineered from the community "userdoccers" and from open-source clients. The project should ship this as an experiment, test with a throwaway account, and say so in its README. This is a risk to the user's account, not a technical blocker.

**Source quality.** The official docs (docs.discord.com) cover bots only. User-account behaviour comes from [discord-userdoccers](https://github.com/discord-userdoccers/discord-userdoccers) (rendered at [docs.discord.food](https://docs.discord.food)), which I cloned and read on 2026-10-30. Items marked **(memory)** are not in any source I could open today and need a packet capture of the real web client before they are trusted. Items marked **(verified)** were read in the cited source.

**Biggest finding for Zinc.** `plugins/webrtc` already vendors libdatachannel (ICE by libjuice, DTLS, SRTP, RTP packetizers, RTCP NACK/SR), libopus and libvpx, plus VideoToolbox H.264. discord-video-stream shows that Discord's video and Go Live transport is driven by a libdatachannel `PeerConnection` against Discord's ICE-lite SDP (section 5). That removes most of the hardest video work. Voice-only, however, uses the plain UDP transport (section 4).

## 1. Login

### 1.1 Options

| Method | Endpoints | Needs | Captcha risk | Ban risk | Work |
|---|---|---|---|---|---|
| Token paste | none (token goes in `Authorization`) | user copies a token from the browser dev tools | none | lowest (no login event at all) | trivial |
| QR remote auth | `wss://remote-auth-gateway.discord.gg/?v=2`, then `POST /users/@me/remote-auth/login` | the phone app scans the QR; RSA-2048 OAEP | none | low (the phone authorises it) | small |
| Email/phone + password | `POST /auth/login`, `POST /auth/mfa/{totp,sms,backup,webauthn}` | password handling, hCaptcha, MFA UI, new-location verification | high | highest (login events from a new client are what the anti-abuse system watches) | large |

Dissent recommends token login and calls password login "strongly discouraged". discord-lite implements password, 2FA and captcha (`DLLoginWindowController`, `DLTwoFactorWindowController`, `DLCaptchaWindowController`).

### 1.2 REST login (verified, userdoccers `authentication.mdx`)

1. Get a fingerprint: call "Get Experiment Assignments" unauthenticated, send the result in the `X-Fingerprint` header until login completes.
2. `POST /auth/login` with `{login, password, undelete?, login_source?, gift_code_sku_id?}`. `login` is an email or an E.164 phone number, `password` is 8 to 72 characters.
3. Response either has `token` (done) or `{mfa: true, ticket, login_instance_id, totp, sms, backup, webauthn}`. The `webauthn` field holds a stringified challenge.
4. MFA: `POST /auth/mfa/{totp|sms|backup|webauthn|password}` with `{ticket, login_instance_id, code, login_source?, gift_code_sku_id?}`. For SMS, `POST /auth/mfa/sms/send {ticket}` first. For WebAuthn, `code` is the stringified credential JSON. Response: `{token, user_settings}`.
5. New location: the login is refused. The user gets an email link (token in the URL fragment) or, for phone accounts, error `70007` plus an SMS. Then `POST /auth/authorize-ip {token}` returns 204 and the login is retried without a new captcha.
6. A 403 with `suspended_user_token` is only for the appeals flow, not for normal API use.
7. Passwordless WebAuthn also exists: `/auth/passwordless/start`, then `/auth/conditional/finish`. Skip it.

### 1.3 Captcha (verified, `topics/captcha-handling.mdx`)

A challenged request returns **HTTP 400** with `captcha_key[]`, `captcha_service`, and (hCaptcha) `captcha_sitekey`, `captcha_session_id`, `captcha_rqdata`, `captcha_rqtoken`, `should_serve_invisible`. Detect it by status 400 plus the presence of `captcha_key`, not by the error text. The site key is dynamic, never hard-code it. `captcha_rqdata`, if present, must be passed to the hCaptcha challenge request or the solution is rejected. After solving, retry the same request with headers `X-Captcha-Key: <solution>`, `X-Captcha-Session-Id` (if given) and `X-Captcha-Rqtoken` (if given). Older body fields are deprecated. Any endpoint may return a captcha, including accept-invite and friend requests.

A native client needs a real web view to show hCaptcha. Zinc has `plugins/webview`, and discord-lite opens a captcha window on Mac OS X 10.5 or later only. Without a web view the password flow cannot work, which is one more reason to start with token and QR.

### 1.4 QR remote auth (verified, `remote-authentication/desktop`)

- Connect to `wss://remote-auth-gateway.discord.gg/?v=2` with the header `Origin: https://discord.com` (`ptb.` and `canary.` also accepted). A wrong origin is rejected. Check that `zinc:socket`'s WebSocket client lets a program set `Origin`; if not, that is an engine gap to fix in the engine.
- Server sends `hello {heartbeat_interval, timeout_ms}`. The client generates RSA-2048, e=65537.
- Client sends `init {encoded_public_key}` (base64 of the DER SubjectPublicKeyInfo).
- Server sends `nonce_proof {encrypted_nonce}`. Decrypt with RSA-OAEP (MGF1-SHA-256, hash SHA-256, no label). Client replies `nonce_proof {nonce}` with the plaintext as unpadded base64url.
- Server sends `pending_remote_init {fingerprint}`. Check it equals base64url(SHA-256(DER public key)), unpadded. Show the QR `https://discord.com/ra/<fingerprint>`.
- After the phone scans: `pending_ticket {encrypted_user_payload}`. RSA-OAEP decrypt, UTF-8, split on `:` into `id:discriminator:avatar:username` (avatar `0` means none). Show it so the user can confirm.
- After the phone confirms: `pending_login {ticket}`, then `POST /users/@me/remote-auth/login {ticket}` returns `{encrypted_token}`. RSA-OAEP decrypt to get the token. `cancel` means the phone refused.
- Client sends `{"op":"heartbeat"}` every `heartbeat_interval`, expects `heartbeat_ack`. Close codes: 4000 version, 4001 decode or failed nonce proof, 4002 handshake failure, 4003 session timed out.
- Crypto needed: RSA keygen, RSA-OAEP-SHA256, SHA-256, base64. mbedTLS (already vendored) has all of it. QR rendering: `plugins/qrcode` exists.

### 1.5 Recommendation

Implement in this order: (1) token paste, stored in the OS keychain; (2) QR remote auth, which needs no password, no captcha and no MFA UI and lets the phone vouch for the session; (3) password + TOTP + captcha through the web view only if users ask for it. This is the reverse of discord-lite, which started with password login because QR did not exist when it was written.

## 2. Main gateway for a user account

### 2.1 Connection

| Item | Value | Source |
|---|---|---|
| Discovery | `GET /gateway` or hard-code `wss://gateway.discord.gg`. Resume on the `resume_gateway_url` from READY | verified |
| Version | `v=9` is what userdoccers uses; Abaddon says it uses "API v9 endpoints". The bot docs show `v=10`. discord-lite still ships `v=6` (`WS_GATEWAY_URL "wss://gateway.discord.gg/?encoding=json&v=6"`, `API_ROOT .../api/v6`), which I could not confirm still works. Use v9 | verified |
| Encoding | `json` or `etf`. Use JSON | verified |
| Transport compression | `compress=zlib-stream` (shared zlib context, flush at suffix `00 00 ff ff`) or `compress=zstd-stream` (one zstd decompression context for the connection, call decompress-stream until the frame is done). Zinc vendors `third_party/zstd`; zlib is available too. Payload compression (`compress:true` in IDENTIFY) is a separate legacy zlib option, JSON only, cannot be combined | verified |
| Heartbeat | After HELLO (op 10), wait `heartbeat_interval * random(0..1)`, then send op 1 `{d: last_seq or null}` every interval. Reply to a server op 1 at once. No ACK (op 11) before the next beat means a zombie connection: close with a code other than 1000/1001 and resume | verified |
| QoS heartbeat | Op 40, and op 41 "Update Time Spent Session ID" on connect and every 30 min | verified (userdoccers) |
| Resume | Op 6 `{token, session_id, seq}` on `resume_gateway_url`. Op 7 means reconnect and resume. Op 9 with `d:true` means resume, `d:false` means re-identify. Closing with 1000/1001 invalidates the session | verified |
| Gateway send limit | 120 events per 60 s per connection; more disconnects, repeat offenders lose API access | verified (bot docs; assume it holds for users) |
| Close codes | 4000 unknown, 4001 unknown opcode, 4002 decode error, 4003 not authenticated, 4004 authentication failed, 4005 already authenticated, 4007 invalid seq, 4008 rate limited, 4009 session timed out, 4012 invalid API version. 4004 means the token is dead: go back to login, do not retry | verified |

### 2.2 IDENTIFY (op 2) for a user

userdoccers example (verified):

```json
{"op":2,"d":{"token":"...","properties":{"os":"linux","browser":"disco","device":"disco"},
 "compress":false,
 "presence":{"activities":[],"status":"unknown","since":0,"afk":false},
 "capabilities":1734653,
 "client_state":{"guild_versions":{},"api_code_version":0}}}
```

No intents for users (all on). `client_state` fields: `guild_versions`, `highest_last_message_id`, `read_state_version`, `user_guild_settings_version`, `user_settings_version`, `private_channels_version`, `api_code_version`, `initial_guild_id`.

`capabilities` bits (verified): 0 LAZY_USER_NOTES, 1 NO_AFFINE_USER_IDS, 2 VERSIONED_READ_STATES, 3 VERSIONED_USER_GUILD_SETTINGS, 4 DEDUPE_USER_OBJECTS, 5 PRIORITIZED_READY_PAYLOAD (needs 4), 6 MULTIPLE_GUILD_EXPERIMENT_POPULATIONS, 7 NON_CHANNEL_READ_STATES, 8 AUTH_TOKEN_REFRESH, 9 USER_SETTINGS_PROTO, 10 CLIENT_STATE_V2, 11 PASSIVE_GUILD_UPDATE (superseded by 14), 12 AUTO_CALL_CONNECT, 13 DEBOUNCE_MESSAGE_REACTIONS, 14 PASSIVE_GUILD_UPDATE_V2, 15 CHANNEL_OBFUSCATION, 16 AUTO_LOBBY_CONNECT. The sample value 1734653 is `0x1A7FFD`. A minimal client should avoid bit 9 (settings arrive as a protobuf in `user_settings_proto`) and bit 15, and may leave bit 5 off so READY is one payload.

### 2.3 Client properties and `X-Super-Properties`

Sent in IDENTIFY `properties` and, as base64 JSON, in the `X-Super-Properties` header of every HTTP request. userdoccers says the header is "highly recommended" because of its role in anti-abuse, and that the `User-Agent` header must match `browser_user_agent`. Fields (verified):

| Field | Example |
|---|---|
| `os` | `"Windows"`, `"Mac OS X"`, `"Linux"` |
| `browser` | `"Chrome"` (web) or `"Discord Client"` (desktop app) |
| `device` | `""` on desktop; model on mobile |
| `system_locale` | `"en-US"` |
| `browser_user_agent` | full UA string |
| `browser_version` | `"136.0.0.0"` (Chrome) or the Electron version |
| `os_version` | `"10"`; kernel version on Linux |
| `release_channel` | `"stable"` |
| `client_build_number` | integer, e.g. 396858. Some experimental features need a recent number. The docs do not say how to get it; clients scrape it from the web app's JS bundle (memory) |
| `native_build_number` | desktop only, may be null |
| `client_event_source`, `client_launch_id` (UUID), `client_app_state` | `null`, uuid, `"focused"` |

Related headers: `X-Discord-Locale`, `X-Fingerprint` (before login), `Authorization: <token>` (no `Bearer` for user tokens).

What the reference clients send:

| Client | IDENTIFY properties | Notes |
|---|---|---|
| discord-lite (Objective-C, curl + OpenSSL) | `$os:"Apple macOS"`, `$browser:"Apple macOS"`, `$device:"Apple Mac"` (old bot-style keys), `compress:false`, presence online | Its `X-Super-Properties` imitates the desktop app: `os:"Mac OS X"`, `browser:"Discord Client"`, `release_channel:"stable"`, `client_version:"0.0.326"`, `browser_version:"32.2.2"` (Electron), `client_build_number:209354`, locale `en-US`. Stale values; these would be mismatched today |
| Abaddon (C++) | Presents as the official web client: browser UA, "the same IDENTIFY message", API v9 | README admits it does not replicate the `/science` telemetry |
| Dissent / ningen (Go, arikawa) | Not stated in the README | Token login recommended; REST use deliberately limited |

The consistent lesson: send one coherent identity (UA, `browser_version`, `os`, `client_build_number`) in IDENTIFY, in `X-Super-Properties` and in `User-Agent`, and refresh the build number from the live web client instead of baking it in.

### 2.4 READY and READY_SUPPLEMENTAL (verified)

READY (op 0, t READY) carries: `v`, `user`, `session_id`, `session_type`, `resume_gateway_url`, `api_code_version`; `guilds` (full for small guilds, `{id, unavailable}` otherwise); `private_channels` (DMs and group DMs); `relationships`; `read_state` and `user_guild_settings`, each `{entries, partial, version}`; `user_settings_proto` (base64 protobuf, with bit 9) or legacy `user_settings`; `notification_settings`; `users` (the deduplicated user objects when bit 4 is set); `merged_members`, `presences`/`merged_presences`; `sessions`; `auth_token` (with bit 8); `analytics_token`; `experiments`, `guild_experiments`; `country_code`; `notes` unless bit 0.

With bit 5, the payload is split: READY_SUPPLEMENTAL (op 0, t READY_SUPPLEMENTAL) follows with `guilds` (each `{id, voice_states, activity_instances}`), `merged_members`, `merged_presences`, `lazy_private_channels`, `disclose`, `game_invites`.

A client must keep local stores for guilds, channels, roles, members, read states and user guild settings, and apply the dispatch events (GUILD_CREATE/UPDATE/DELETE, CHANNEL_*, GUILD_MEMBER_*, GUILD_ROLE_*, READ_STATE/MESSAGE_ACK, USER_GUILD_SETTINGS_UPDATE, PRESENCE_UPDATE, TYPING_START, MESSAGE_CREATE/UPDATE/DELETE, VOICE_STATE_UPDATE...) to them.

### 2.5 Lazy guilds and member lists (op 14 / op 37)

User accounts do not receive every member or presence. The client subscribes per guild:

- Op 14 "Guild Subscriptions" (marked deprecated in userdoccers) and op 37 "Guild Subscriptions Bulk" (current) update subscriptions, in the shape `{subscriptions: {<guild_id>: {typing, activities, threads, member_updates, channels: {<channel_id>: [[0,99]]}, members: [user ids], thread_member_lists}}}` for op 37, and a single-guild body `{guild_id, typing, threads, activities, members, channels}` for op 14. **(memory: userdoccers has the opcode names but not the body; the Litecord issue and the discord-unofficial-docs issue describe op 14 as undocumented and reverse-engineered. Capture the web client before relying on field names.)**
- The member sidebar then arrives as `GUILD_MEMBER_LIST_UPDATE` with ops SYNC, INVALIDATE, INSERT, UPDATE, DELETE over the requested ranges (confirmed in the Litecord issue). `PASSIVE_GUILD_UPDATE_V2` (capability bit 14) replaces `CHANNEL_UNREAD_UPDATE` for guilds the client is not viewing.
- Op 8 "Request Guild Members" exists for explicit lookups, limited to 1 request per guild per session per 30 s.
- Other ops: 3 presence update, 4 voice state update, 13 call connect, 18/19/20/22 streams, 30 request deleted entity IDs, 31 request soundboard sounds, 36 request channel statuses (deprecated), 40/41 as above.

A text MVP can subscribe only to the open guild and the open channel range, which also keeps traffic low (a ban-risk reducer).

### 2.6 Ban-risk practices (from the three clients' READMEs)

| Do | Avoid |
|---|---|
| One coherent, current client identity (2.3) | Stale `client_build_number`, mismatched UA |
| Follow `Retry-After`, bucket headers, 120 events/60 s | Parallel bursts, unbounded retries (10,000 invalid requests per 10 min per IP triggers a Cloudflare restriction) |
| Keep one long-lived connection, resume instead of re-identifying | Frequent disconnect/reconnect, IDENTIFY loops (Abaddon: a trigger) |
| Persist the token and the `ack`/read state, subscribe lazily | Joining or leaving servers (Abaddon: "the main trigger"), starting new DMs, friend-list management, editing the profile while connected via a third-party client |
| Send typing and acks like the real client (typing every ~8 s while typing, as discord-lite does) | Friend requests: discord-lite refuses to implement them, citing the ToS; they are also a captcha endpoint |

Do not implement: friend requests, joining by invite, profile edits, server moderation, anything that creates accounts or sends unsolicited DMs.

## 3. REST for text

Base: `https://discord.com/api/v9`. Every request carries `Authorization`, `User-Agent`, `X-Super-Properties`, `X-Discord-Locale`. TLS 1.3 via mbedTLS (`zinc:socket.connectTls`); HTTP via llhttp or the engine's HTTP client.

| Need | Call | Notes |
|---|---|---|
| Messages, list | `GET /channels/{id}/messages?limit=1..100&before|after|around=<snowflake>` | default 50 (verified). Needs `READ_MESSAGE_HISTORY` |
| Send | `POST /channels/{id}/messages` `{content (<=2000), nonce, message_reference:{message_id}, allowed_mentions, flags, attachments, sticker_ids}` | `nonce` returned in the echo MESSAGE_CREATE for dedupe. `flags` for users: `SUPPRESS_EMBEDS` (1<<2), `SUPPRESS_NOTIFICATIONS` (1<<12) (verified) |
| Reply | same call with `message_reference.message_id`; `allowed_mentions.replied_user` controls the ping | verified |
| Edit / delete | `PATCH` and `DELETE /channels/{id}/messages/{id}` | **(memory)** standard routes; the message page I could read was truncated before them |
| Attachments | Either multipart `files[n]` with `attachments[]` metadata, or the cloud flow: `POST /channels/{id}/attachments {files:[{id, filename, file_size}]}` returns `{attachments:[{id, upload_url, upload_filename}]}`; `PUT` the bytes to `upload_url`; then send the message with `attachments:[{id, filename, uploaded_filename}]` | verified, up to 500 MiB uploaded; message size limits still apply; max 10 files per message |
| Typing | `POST /channels/{id}/typing` (204). May return 200 with `message_send_cooldown_ms` | verified; indicator expires 10 s after the last TYPING_START |
| Ack / read state | `POST /channels/{id}/messages/{msg_id}/ack` `{token?, manual?, mention_count?, flags?, last_viewed?}` | `mention_count` needs `manual:true`; `last_viewed` = days since the Discord epoch (2015-01-01); `flags` set `IS_GUILD_CHANNEL`, `IS_THREAD`, `IS_MENTION_LOW_IMPORTANCE` when they differ from stored. The new Rust read-state service returns `token:null` and ignores tokens (verified) |
| Guild / channel / DM lists | From READY (`guilds`, `private_channels`) and later dispatches; no REST needed for the list | `GET /users/@me/channels` exists but is redundant |
| Open a DM | `POST /users/@me/channels {recipients:[id]}` | **new DM = ban risk, skip in MVP** |

Rate limits (verified, bot docs and userdoccers): headers `X-RateLimit-Limit`, `-Remaining`, `-Reset`, `-Reset-After` (decimal seconds), `-Bucket` (use it as the bucket key), and on 429 only `X-RateLimit-Global` and `X-RateLimit-Scope` (`user`, `global`, `shared`); the 429 body is `{message, retry_after, global, code?}`. Global limit: 50 requests per second per token. Do not hard-code per-route numbers. Top-level resources (channel, guild, webhook) count separately; emoji routes do not follow the convention.

CDN (verified), base `https://cdn.discordapp.com/`:

| Asset | Path |
|---|---|
| User avatar | `/avatars/{user_id}/{hash}.png` (`a_` prefix = animated, use `.gif`/`.webp`) |
| Guild icon | `/icons/{guild_id}/{hash}.png` |
| Custom emoji | `/emojis/{emoji_id}.png` (or `.gif`/`.webp`) |
| Attachment | `/attachments/{channel_id}/{message_id}/{attachment_id}/{filename}?ex=&is=&hm=` |

`?size=` takes a power of two from 16 to 4096. Attachment URLs are signed and expire (`ex`); renew with `POST /attachments/refresh-urls {attachment_urls:[...]}` (1 to 50, verified). Embed images go through `media.discordapp.net` or `images-ext-*.discordapp.net`. Users without an avatar get a default avatar index derived from the user ID (memory).

## 4. Voice (audio only)

### 4.1 Flow

1. On the main gateway send op 4 Voice State Update `{guild_id, channel_id, self_mute, self_deaf}` (for a DM call `guild_id: null`).
2. Receive VOICE_STATE_UPDATE (gives `session_id`) and VOICE_SERVER_UPDATE (`token`, `endpoint`; a `null` endpoint means the server was reallocated, wait).
3. Connect `wss://<endpoint>?v=8` (verified: current recommended version; versions below 4 and no version were rejected from 2024-11-18).
4. Send voice Identify (op 0) `{server_id (channel id for DMs), user_id, session_id, token, max_dave_protocol_version, video?, streams?}` (verified for the DAVE and video fields; core fields from memory).
5. Receive Hello (op 8, `heartbeat_interval`) and Ready (op 2: `ssrc`, `ip`, `port`, `modes`, `streams`).
6. UDP IP discovery, then Select Protocol (op 1), then Session Description (op 4: `mode`, `secret_key`, `dave_protocol_version`, and for video `video_codec`).
7. Send Speaking (op 5), then RTP.

### 4.2 Opcodes (verified, current docs)

| Op | Name | Op | Name |
|---|---|---|---|
| 0 | Identify | 11 | Clients Connect |
| 1 | Select Protocol | 12 | Video |
| 2 | Ready | 13 | Client Disconnect |
| 3 | Heartbeat | 15 | Media Sink Wants |
| 4 | Session Description | 16 | Voice Backend Version |
| 5 | Speaking | 18 | Client Flags |
| 6 | Heartbeat ACK | 20 | Client Platform |
| 7 | Resume | 21 to 31 | DAVE (section 4.5) |
| 8 | Hello | | |
| 9 | Resumed | | |

v8 adds server message buffering so missed messages are re-delivered on resume, and binary DAVE frames carry an optional 2-byte big-endian sequence number. Heartbeat in v8 carries `seq_ack` (memory).

### 4.3 UDP and encryption (verified)

IP discovery packet, 74 bytes, all big-endian: type (2: 0x1 request, 0x2 response), length (2: 70), SSRC (4), address (64, null-terminated string in the response), port (2). Send the request with your SSRC, read your public address and port, put them in Select Protocol `{protocol:"udp", data:{address, port, mode}}`.

Encryption modes:

| Mode | Status |
|---|---|
| `aead_aes256_gcm_rtpsize` | available, preferred when the hardware or library supports it |
| `aead_xchacha20_poly1305_rtpsize` | **required** (every client must support it) |
| `xsalsa20_poly1305_lite_rtpsize`, `aead_aes256_gcm`, `xsalsa20_poly1305`, `_suffix`, `_lite` | deprecated, refused since 2024-11-18 |

Layout of a voice packet: 12-byte RTP header (`0x80`, payload type `0x78`, 16-bit sequence, 32-bit timestamp, 32-bit SSRC), then the encrypted Opus. For the `_rtpsize` modes the header (plus CSRC and the 4-byte extension header if any) is authenticated as AAD, and a 32-bit incrementing counter is appended to the packet as the nonce, zero-padded to 12 bytes for AES-GCM and 24 bytes for XChaCha20 (discord.js voice: 12 and 24-byte nonce buffers, verified). The 32-byte `secret_key` comes from Session Description. Details of which extension bytes are encrypted: take them from the current docs page and from discord.js `@discordjs/voice` source before coding.

Opus: 48 kHz, stereo, 20 ms frames (standard; the docs state 48 kHz and 2 channels). Speaking flags: 1<<0 microphone, 1<<1 soundshare, 1<<2 priority. Send at least one Speaking (op 5) with a non-zero mode before audio; `delay` 0. Send silence frames (`0xF8 0xFF 0xFE`) at the end of speech (memory, from discord.js).

### 4.4 Zinc fit and libraries

| Piece | Proven library | Licence | In Zinc today |
|---|---|---|---|
| Opus encode/decode | libopus | BSD-3-Clause | vendored by `plugins/webrtc` |
| XChaCha20-Poly1305 | Monocypher | CC0 / BSD-2 | `third_party/monocypher` |
| AES-256-GCM | mbedTLS | Apache-2.0 | `third_party/mbedtls` |
| UDP, WebSocket, TLS | `zinc:socket` | n/a | present |
| Mic capture, playback | `zinc:microphone`, `zinc:audio` | n/a | present (audio plugin does not decode Opus, not needed here) |
| Jitter buffer, resampler, noise suppression, VAD | write the buffer (small); rnnoise for noise | BSD-3 (rnnoise) | not present |

Reference implementations to read: `discord.js/packages/voice` (MIT/Apache, Networking.ts handles IP discovery, mode selection and DAVE), songbird (Rust, ISC; opus2 + optional Symphonia; I could not confirm DAVE support from its README), Abaddon's voice code (C++, GPL-3.0, so read-only: miniaudio, libopus, libsodium, rnnoise, libdave, mlspp).

### 4.5 DAVE end-to-end encryption

**Status (verified).** Discord's blog says that in **early March 2026** DAVE became the default for every voice and video call: DMs, group DMs, voice channels and Go Live (stage channels and text are excluded). The docs say E2EE calls are supported only from **2026-03-01** and "required all clients to support DAVE before joining a call". News reports date enforcement to 2026-03-01 or 03-02. The unencrypted fallback code was still being removed (no date given), after which it "will not be possible to fall back". Conclusion: **a client without DAVE cannot join any call today, so voice cannot ship without it.** Clients announce support with `max_dave_protocol_version` in the voice Identify; the server picks the lowest shared version (current version: 1).

**Protocol (v1.1, daveprotocol.com and `discord/dave-protocol`; verified).**
- MLS 1.0, ciphersuite 2 (DHKEMP256_AES128GCM_SHA256_P256), one extension (External Senders = the voice gateway), basic credentials only, identity = big-endian 64-bit user snowflake, key package lifetime `not_before=0, not_after=2^64-1`.
- Media cipher: AES-128-GCM, 8-byte truncated tag. Per-sender key from the MLS exporter, label `"Discord Secure Frames v0"`, context = little-endian 64-bit sender user ID, 16 bytes. Key generation = top byte of the nonce; rotates every 2^24 frames; old keys kept up to 10 s.
- Frame layout: encrypted ranges interleaved with unencrypted ranges, 8-byte tag, ULEB128 truncated 32-bit nonce, ULEB128 (offset, length) pairs for unencrypted ranges (authenticated as AAD), 1-byte supplemental size, 2-byte magic `0xFAFA`.
- Codec handling: Opus fully encrypted; VP8 leaves 1 byte (P=1) or 10 bytes (P=0); VP9 fully encrypted; H.264/H.265 encrypt VCL payloads, leave the rest, avoid start codes by bumping the nonce (up to 10 tries); AV1 leaves OBU headers, needs a patched depacketizer for the last OBU's size. The SFU may inject a 3-byte silence frame `F8 FF FE` that passes through.
- Opcodes:

| Op | Name | Encoding | Content |
|---|---|---|---|
| 21 | prepare_transition | JSON | `protocol_version`, `transition_id` (0 = immediate re-init) |
| 22 | execute_transition | JSON | `transition_id` |
| 23 | ready_for_transition | JSON, client sends | `transition_id` |
| 24 | prepare_epoch | JSON | `protocol_version`, `epoch` (1 = new group) |
| 25 | mls_external_sender_package | binary | seq(u16), op(u8), ExternalSender (signature key, credential type 1, identity) |
| 26 | mls_key_package | binary, client sends | op(u8), MLSMessage KeyPackage; sent after a non-zero version is chosen, after epoch=1, or after an invalid commit |
| 27 | mls_proposals | binary | seq, op, operation_type (0 append, 1 revoke), proposals or refs |
| 28 | mls_commit_welcome | binary, client sends | op, commit MLSMessage, then Welcome if members were added |
| 29 | mls_announce_commit_transition | binary | seq, op, transition_id(u16), commit |
| 30 | mls_welcome | binary | seq, op, transition_id(u16), Welcome |
| 31 | mls_invalid_commit_welcome | JSON, client sends | `transition_id` |

- Downgrade: op 21 with version 0, receivers enable passthrough, answer op 23, server sends op 22. Privacy codes (30-digit epoch authenticator, 45-digit pairwise fingerprint via scrypt N=16384 r=8 p=2) are optional UI.
- Go Live uses the same protocol with a stream-specific group ID: the media-session ID, one less than the stream's `rtc_server_id` (docs.discord.food).

**libdave** ([discord/libdave](https://github.com/discord/libdave), MIT, used by Discord's own native clients, audited by Trail of Bits). C++ (`cpp/`) plus a JS/WASM build (`js/`). Depends on **mlspp** (Cisco, built with `-DMLS_CXX_NAMESPACE=mlspp -DDISABLE_GREASE=ON`, BSD-2-Clause as I recall) and an SSL backend (**BoringSSL**, OpenSSL 1.1 or OpenSSL 3), pulled through a vcpkg submodule; `make` builds a static or shared library. It **has a C API**: `cpp/includes/dave/dave.h` exports `extern "C"` functions with opaque handles (read in the repo today):

| Group | Functions |
|---|---|
| Version | `daveMaxSupportedProtocolVersion`, `daveFree` |
| Session | `daveSessionCreate/Destroy/Init/Reset`, `SetProtocolVersion/GetProtocolVersion`, `SetExternalSender`, `ProcessProposals`, `ProcessCommit`, `ProcessWelcome`, `GetMarshalledKeyPackage`, `GetKeyRatchet`, `GetPairwiseFingerprint`, `GetLastEpochAuthenticator` |
| Results | `daveCommitResult*`, `daveWelcomeResult*` (failed, ignored, roster member IDs and signatures) |
| Encryptor | `daveEncryptorCreate/Destroy`, `SetKeyRatchet`, `SetPassthroughMode`, `AssignSsrcToCodec`, `GetMaxCiphertextByteSize`, `Encrypt`, stats |
| Decryptor | `daveDecryptorCreate/Destroy`, `TransitionToKeyRatchet`, `TransitionToPassthroughMode`, `Decrypt`, `GetMaxPlaintextByteSize`, stats |
| Logging | `daveSetLogSinkCallback` |

So Zinc can call it through its FFI plugin (`plugins/ffi`) or a thin native plugin. The cost: libdave brings mlspp and OpenSSL/BoringSSL, which means a second crypto stack beside mbedTLS (the webrtc plugin already notes "one TLS stack in the process"). Keep it inside the voice plugin, statically linked. Abaddon already ships exactly this combination (libdave + mlspp) in a C++ client.

**How the JS ecosystem did it.** `@discordjs/voice` does not use libdave: it uses `@snazzah/davey` through `DAVESession` (`createDaveSession`, `getMaxProtocolVersion`). On Session Description it creates the session with the user ID and channel ID, sends op 26 with the key package, answers op 27 with op 28, handles 21 to 24 and 29 to 30, replies op 31 on a bad commit, and encrypts each Opus frame with `daveSession.encrypt` **before** the transport (rtpsize) encryption. `davey` ([Snazzah/davey](https://github.com/Snazzah/davey), MIT) is Rust on OpenMLS 0.7.x, with Node (napi) and Python (pyo3) bindings, and the `Codec`/`MediaType` enums discord-video-stream uses for video. A Rust build would add a toolchain Zinc does not otherwise need; libdave's C ABI is the better fit. Another Rust crate, `dave`, is AGPL-3.0 (avoid).

**Effort.** The protocol logic is in libdave: Zinc owns only the op 21 to 31 state machine (about 150 lines in discord.js), transition IDs, passthrough, and wiring encrypt/decrypt around each frame. The build (vcpkg for mlspp + BoringSSL, with the pinned zig) is the real cost.

## 5. Video and Go Live

### 5.1 Transport: WebRTC against ICE-lite (verified, discord-video-stream source)

The older UDP path is plain RTP. For camera and Go Live, discord-video-stream (npm `@dank074/discord-video-stream`, repo Discord-RE/Discord-video-stream, ISC) does **not** use raw UDP. It builds a libdatachannel `PeerConnection` and sends Select Protocol (op 1) with `{protocol:"webrtc", codecs:[...], data: <sdp>, sdp: <sdp>, rtc_connection_id: <uuid>}`. Discord answers (op 4) with its own SDP containing `c=`, `a=ice-ufrag`, `a=ice-pwd`, `a=fingerprint`, `a=candidate`, `a=rtcp`; the library discards it and builds its own answer (audio mid 0 Opus `useinbandfec=1;usedtx=1`; video mid 1 with RTX and `nack`, `nack pli`, `ccm fir`, `goog-remb`, `transport-cc`; `a=ice-lite`, `a=setup:passive`; extmaps 1 ssrc-audio-level, 2 abs-send-time, 3 transport-cc, 13 video-orientation, 14 toffset), then calls `setRemoteDescription(..., "answer")`. DTLS-SRTP from libdatachannel secures the media; the `aead_*_rtpsize` modes are for the UDP path. Because `plugins/webrtc` is libdatachannel, the transport is already in the tree; what is missing is Discord's SDP munging and ICE-lite handling, plus exposing Discord-specific RTP header extensions and RTX/SSRC control. Check whether the plugin's JS surface lets a program set explicit SSRCs and RTX payload types; if not, that is an engine gap to fix in the plugin.

### 5.2 Gateway and voice-gateway messages

| Step | Message | Fields |
|---|---|---|
| Announce video | main gateway op 4 | `self_video: true` (discord-video-stream `signalVideo`, verified) |
| Voice Identify | voice op 0 | `video: true`, `streams: [{type:"screen"|"video", rid:"100", quality:100}]`, `max_dave_protocol_version` (verified) |
| Server grants | voice op 2 Ready | `streams[]` with server-assigned `ssrc` and `rtx_ssrc` (RTX defaults to `ssrc+1`) |
| Describe video | voice op 12 Video | `{audio_ssrc, video_ssrc, rtx_ssrc, streams:[{type:"video", rid:"100", ssrc, active:true, quality:100, rtx_ssrc, max_bitrate, max_framerate, max_resolution:{type:"fixed", width, height}}]}`; send it before any video or the connection drops with Invalid SSRC; send `video_ssrc:0, rtx_ssrc:0, streams:[]` to stop (verified) |
| Simulcast | `streams[]` with `rid` and `quality` 0..100, `active:false` pauses a layer | Cameras offer quality 100 and 50, screen share one layer at 100 (verified). discord-video-stream hard-codes one layer |
| Receive control | voice op 15 Media Sink Wants | map of primary SSRC (or `any`) to 0..100 (0 disables), optional `pixelCounts`. Senders should treat it as encoder input (verified) |
| Per-user video | voice op 12 received | `user_id, audio_ssrc, video_ssrc, streams` |
| Go Live start | main gateway **op 18 Create Stream** `{type:"guild"|"call", guild_id, channel_id, preferred_region}` | Then op 22 Set Paused `{stream_key, paused:false}` (verified in discord-video-stream) |
| Go Live server | dispatch STREAM_CREATE (`stream_key`, `rtc_server_id`, ...), then STREAM_SERVER_UPDATE `{token, stream_key, endpoint}` | Connect a **second** voice websocket with `server_id = rtc_server_id` and that token, separate transport and SSRC namespace; the parent voice connection must stay up (verified) |
| Watch | main gateway **op 20 Watch Stream** `{stream_key}` | viewers get the video SSRC via Media Sink Wants; only the owner transmits (verified) |
| Stop | main gateway **op 19 Delete Stream** `{stream_key}` | STREAM_DELETE carries a `reason` (e.g. `stream_full`) (verified) |

Stream key format: `guild:<guild_id>:<channel_id>:<user_id>` or `call:<channel_id>:<user_id>`.

Codecs (verified): Select Protocol codec entries `{name, type, priority, payload_type, rtx_payload_type (video), encode, decode}`; the official preference is AV1 and H.265 preferred, H.264 default, VP8 and VP9 available; the server falls back to H.264. discord-video-stream supports **VP9, H.264, H.265, AV1** and dropped VP8 "for maintainability". The README lists RTP and RTX, regular and Go Live connections, transport and E2E encryption, and RTP header extensions 1 to 14. RTP rules: 90 kHz clock, marker bit on the last packet of a frame, RTX on the repaired-RID extension. For a Zinc sender, **H.264 is the pragmatic first choice**: VideoToolbox already feeds `plugins/webrtc` on macOS and H.264 is the server's default. VP8 (libvpx, vendored) works too but is no longer the main path.

### 5.3 What discord-video-stream implements, and how hard

It sends only (it does not render other people's screens): FFmpeg (libav through `node-av`) demux and decode, re-encode to Discord-friendly H.264 (it rewrites SPS VUI for compatibility, `SPSVUIRewriter`), RTP packetising by libdatachannel (`H264/H265/VP8/VP9/AV1RtpPacketizer`), NACK responder, RTCP sender reports, pacing, bitrate estimation, and DAVE via `@snazzah/davey` (`Codec`, `MediaType`). It requires a user token and says bot tokens are refused by Discord for video.

Difficulty for Zinc, in rising order:

1. **Receive and render a Go Live** (watch only): op 20, second voice socket, ICE/DTLS via libdatachannel, depacketise, DAVE-decrypt, hardware decode (VideoToolbox/FFmpeg plugin exists). Medium.
2. **Camera send**: `plugins/camera` capture, encode (VideoToolbox H.264), op 12, RTX/NACK, DAVE-encrypt per NAL with the unencrypted ranges above. Medium to hard.
3. **Screen send (Go Live)**: needs a screen-capture source (ScreenCaptureKit on macOS, other APIs per OS; not present in `plugins/`), op 18 flow, second voice connection, bitrate adaptation with TWCC, keyframe-on-demand (PLI/FIR). Hard, mostly because of platform capture and congestion control quality, not the protocol.
4. Simulcast, multi-layer camera and stream previews (`setStreamPreview` posts a JPEG to the voice-state preview endpoint): optional, last.

## 6. Notifications

A desktop notification should fire on MESSAGE_CREATE (and similar) when all of these hold (rules from userdoccers `topics/read-state.mdx` and `resources/user-settings.mdx`; the final decision to pop a toast is client policy, not documented as one rule):

1. The author is not the current user, not blocked, not ignored, and the message flags lack `SUPPRESS_NOTIFICATIONS` (1<<12).
2. The channel is not the focused channel of a focused window.
3. The message **mentions the user**: `mentions` contains the user, or `mention_roles` intersects the user's roles (member roles from READY/`merged_members`/GUILD_MEMBER_UPDATE), or `mention_everyone` is true. Role and `@everyone`/`@here` mentions do not count when the guild or channel settings have `suppress_roles` / `suppress_everyone` set. A reply with `replied_user` counts as a mention through `mentions`.
4. In a **DM or group DM** a message notifies unless the private channel is muted (a private-channel mute lives in `user_guild_settings` with `guild_id: null`), or it mentions the user (which overrides the mute for counting). Message type `RECIPIENT_REMOVE` does not count.
5. In a **guild channel** effective settings are: channel override `message_notifications` (0 ALL_MESSAGES, 1 ONLY_MENTIONS, 2 NO_MESSAGES, 3 INHERIT), else the guild's `message_notifications`, else the guild's `default_message_notifications`. `muted` plus `mute_config.end_time` on the guild or the channel override silences everything (an expired `end_time` means unmuted; the client must check the clock). Category overrides apply to children through their `parent_id` in the official client (memory).
6. ALL_MESSAGES level notifies for every message in channels that are not voice or stage channels; ONLY_MENTIONS only for rule 3; NO_MESSAGES never.
7. Threads: notify only if the user joined the thread or is mentioned (memory).

Badges and unread dots are separate from toasts. From the read state: a channel is **unread** if the channel's `last_message_id` is greater than the read state's `last_message_id` (snowflakes grow monotonically); `mention_count` is incremented locally on MESSAGE_CREATE when rule 3 holds (guild) or rule 4 holds (DM); a message the user authors resets `mention_count` to 0 and sets `last_message_id`; the `MENTION_ON_ALL_MESSAGES` notification-settings flag (1<<5) makes every message in an ALL_MESSAGES channel count and flags the read state `IS_MENTION_LOW_IMPORTANCE`. The client acks with `POST .../ack` when the user views the channel (calculate `flags` and `last_viewed` as in section 3) and applies MESSAGE_ACK dispatches from other devices. Event sources: MESSAGE_CREATE, MESSAGE_ACK, CHANNEL_UNREAD_UPDATE (not sent with PASSIVE_GUILD_UPDATE capabilities), USER_GUILD_SETTINGS_UPDATE, NOTIFICATION_SETTINGS_UPDATE, READY `read_state`.

Zinc's side: notification delivery through `zinc:system`. Check that it supports click-to-open and grouping per channel; if not, add it to the plugin.

## 7. discord-lite

Repository [dosdude1/discord-lite](https://github.com/dosdude1/discord-lite), GPL-3.0. Objective-C (580 KB) plus C (236 KB), an Xcode project, universal binaries for PowerPC, i386, x86_64 and arm64; minimum Mac OS X 10.4 Tiger on a G3 with 256 MB. The goal is a modern Discord on vintage Macs. I read the source.

| Area | What it does |
|---|---|
| Features | Servers and DMs, send and view or download attachments, mention and ping notifications, typing indicators, replies, clickable links, two-factor, captcha (10.5+ only), edit and delete messages |
| Skipped | Embeds, voice and video, friend requests ("will not implement due to Discord's terms of service") |
| Networking | Since 0.3-alpha its own backend on libcurl + OpenSSL for both HTTP and WebSocket, TLS 1.3, so no proxy on a newer machine is needed. The WebSocket is driven by `curl_easy_perform` on a detached thread (`DLWSController`, 292 lines) |
| Gateway | `wss://gateway.discord.gg/?encoding=json&v=6`, no compression (`compress:false`), IDENTIFY with `$os/$browser/$device` keys and an online presence, heartbeat by NSTimer using `heartbeat_interval/1000`, a `heartbeatResponseReceived` flag, resume with `session_id` and `seq` after a drop, MESSAGE_CREATE / MESSAGE_DELETE / typing handled by a delegate |
| REST | `https://discord.com/api/v6`, `AsyncHTTPGetRequest`, `/channels/{id}/messages/{id}/ack` and `/channels/{id}/typing`, typing sent every 8 s |
| Identity | `DLUtil superPropertiesString` builds a base64 `X-Super-Properties` imitating the Electron desktop app (see 2.3) |
| UI | Hand-written AppKit view controllers; JSON by TouchJSON (`CJSON*`), regex by RegexKitLite, own scroll views |

Takeaways: a usable text client is about a dozen source files and one WebSocket thread; it does not touch lazy member lists, `READY` stores, DAVE or read-state versioning; and its v6 protocol and stale properties mean its code is a feature checklist, not a spec. Dissent (Go + GTK4, GPL-3.0) covers more text features (folders, threads/forums, reactions, AI summaries, a quick switcher, CSS themes) and says voice "is best handled by the official client". Abaddon (C++ + GTK3, GPL-3.0) is the only open client here with voice and libdave. Because all three are GPL-3.0, Zinc should take behaviour and protocol facts from them, not code.

## 8. Recommended phased plan

Each phase is shippable and read-only-safe before it becomes write-capable.

| Phase | Deliverable | Protocol pieces | Libraries (licence) | Zinc work |
|---|---|---|---|---|
| 0. Spike | Token login, connect, show guild and channel list, receive MESSAGE_CREATE | `GET /gateway`, gateway v9 JSON, HELLO, heartbeat, IDENTIFY (2.2), READY parse, resume (2.1) | zinc:socket WebSocket + TLS, yyjson (MIT) | `Origin` and custom headers on `WebSocket`, a coherent super-properties generator, token in keychain |
| 1. Text MVP | Read and write text in servers and DMs | REST list/send/reply/edit/delete/typing/ack (3), op 37 for the open guild, `GUILD_MEMBER_LIST_UPDATE`, attachments via cloud upload (3), CDN images, rate-limit buckets | zstd (BSD-3, vendored) for `compress=zstd-stream`, libwebp (BSD-3), md4c (MIT) for Markdown, harfbuzz for emoji text, existing `zinc:ui` | Local stores for guilds/channels/roles/members/read states, message virtual list, image cache with expiring URLs |
| 1b. Login | QR remote auth, then password + MFA + captcha | Remote-auth gateway (1.4), `/auth/login`, `/auth/mfa/*`, captcha headers (1.3) | mbedTLS (Apache-2.0) RSA-OAEP-SHA256, `plugins/qrcode`, `plugins/webview` for hCaptcha | Origin header (above) |
| 2. Notifications | Toasts, badges, mute and mention logic | Rules in section 6, `READY.read_state`, `user_guild_settings`, `MESSAGE_ACK`, `USER_GUILD_SETTINGS_UPDATE` | `zinc:system` notifications | Dock badge and tray count, click-to-open |
| 3. Voice | Join and speak in voice channels and DM calls | Op 4 + VOICE_SERVER_UPDATE, voice gateway v8, IP discovery, `aead_aes256_gcm_rtpsize` and `aead_xchacha20_poly1305_rtpsize`, Opus 48 kHz stereo 20 ms, Speaking, resume, **DAVE (4.5)** | libopus (BSD-3, in webrtc plugin), mbedTLS AES-GCM, Monocypher XChaCha20 (CC0/BSD-2), **libdave (MIT) + mlspp (BSD-2) + BoringSSL or OpenSSL (OpenSSL/Apache-2.0)** through its C API, rnnoise (BSD-3, optional) | New `zinc:discord-voice` native plugin (UDP, RTP, mixer, jitter buffer, DAVE state machine); acoustic echo is a hard problem, offer push-to-talk and headphones first |
| 4. Video | Watch Go Live and cameras, then send camera | Voice Identify `video`/`streams`, op 12, op 15, WebRTC `protocol:"webrtc"` select-protocol (5.1), RTX/NACK/PLI, H.264 first, per-NAL DAVE ranges | libdatachannel + libjuice + libsrtp (MPL-2.0 / MIT / BSD-3, already in `plugins/webrtc`), VideoToolbox, libvpx (BSD-3), FFmpeg (LGPL, dynamic) | Extend `plugins/webrtc` for explicit SSRC/RTX/header-extension control and SDP answer injection; decode path to `zinc:video` |
| 5. Screen | Go Live send | Gateway op 18/19/20/22, STREAM_CREATE / STREAM_SERVER_UPDATE, second voice connection with `rtc_server_id`, stream-key E2EE group (5.2), TWCC bitrate control, keyframe requests | ScreenCaptureKit (macOS), then Windows/Linux capture APIs | Capture source plugin, adaptive encoder bitrate |

Order of risk: phases 0 to 2 only call REST and the gateway as the web client does and are the safest. Phase 3 depends on libdave's build and is mandatory-E2EE. Phases 4 and 5 are the only ones that need new engine capability (capture, SSRC-level WebRTC control).

Open questions to settle with a packet capture of the real web client before coding: the exact op 37 body, the current `client_build_number` source, voice Identify and Select Protocol field names in v8 for UDP and WebRTC, and the encrypted extension bytes in `_rtpsize` modes.

## Sources

- Discord, [Voice connections](https://docs.discord.com/developers/topics/voice-connections), [Gateway](https://docs.discord.com/developers/topics/gateway), [Rate limits](https://docs.discord.com/developers/topics/rate-limits)
- Discord, [Every voice and video call is now end-to-end encrypted](https://discord.com/blog/every-voice-and-video-call-on-discord-is-now-end-to-end-encrypted); coverage: [BleepingComputer](https://bleepingcomputer.com/news/security/discord-rolls-out-end-to-end-encryption-on-voice-video-calls), [PiunikaWeb, 2026-03-03](https://piunikaweb.com/2026/03/03/discord-enforcing-end-to-end-encryption-voice-video-calls/)
- [discord-userdoccers](https://github.com/discord-userdoccers/discord-userdoccers) and its rendering [docs.discord.food](https://docs.discord.food/authentication), [remote auth](https://docs.discord.food/remote-authentication/desktop), [voice connections](https://docs.discord.food/topics/voice-connections), [opcodes](https://docs.discord.food/topics/opcodes-and-status-codes), [reference](https://docs.discord.food/reference)
- Litecord, [Lazy guilds](https://gitlab.com/litecord/litecord/-/issues/9); [discord-unofficial-docs issue 15](https://gitlab.com/luna/discord-unofficial-docs/-/issues/15)
- [discord/libdave](https://github.com/discord/libdave) (`cpp/includes/dave/dave.h`, `cpp/vcpkg-alts`), [DAVE protocol whitepaper](https://github.com/discord/dave-protocol/blob/main/protocol.md), [daveprotocol.com](https://daveprotocol.com/)
- [Snazzah/davey](https://github.com/Snazzah/davey), [discord.js voice `Networking.ts`](https://github.com/discordjs/discord.js/blob/main/packages/voice/src/networking/Networking.ts), [serenity-rs/songbird](https://github.com/serenity-rs/songbird)
- [Discord-RE/Discord-video-stream](https://github.com/Discord-RE/Discord-video-stream) (`src/client/Streamer.ts`, `voice/BaseMediaConnection.ts`, `voice/WebRtcWrapper.ts`)
- [dosdude1/discord-lite](https://github.com/dosdude1/discord-lite) (`DLWSController.m`, `DLUtil.m`, `DLController.h`), [diamondburned/dissent](https://github.com/diamondburned/dissent), [diamondburned/arikawa](https://github.com/diamondburned/arikawa), [uowuo/abaddon](https://github.com/uowuo/abaddon)
- In this repo: `docs/plugins/socket.md`, `docs/plugins/webrtc.md`, `docs/plugins/video.md`, `third_party/README.md`
