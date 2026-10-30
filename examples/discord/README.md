# Discord client

A native Discord client written in Zinc, in the spirit of [discord-lite](https://github.com/dosdude1/discord-lite): no web view, no
Electron, a fraction of the official app's memory. It speaks Discord's own protocols (the v9 gateway over `zinc:socket`'s WebSocket, the
HTTP API over `fetch`) and keeps your token in the system keychain (`zinc:secure-store`).

> **Unofficial.** Discord's terms do not allow third-party clients on a user account, and an account can be banned for it. The client
> behaves like the web client (one coherent identity, one long-lived connection that resumes, rate limits honoured, no friend requests,
> no joining servers), which keeps the risk low, not nil. Try it with a spare account. Research and choices:
> [docs/reports/discord-client-research.md](../../docs/reports/discord-client-research.md).

## Run it

```sh
build/zinc run examples/discord
```

Paste your token and press **Log in**: the token is kept in the keychain, the next start logs in by itself; **Log out** forgets it.

What works now: your servers, their channels (by category) and your DMs; a channel's history, loaded 50 messages at a time and older
pages as you scroll up, in a virtual list that stays smooth over thousands of messages; new, edited and deleted messages as they happen;
a dropped connection resumes. Pictures: avatars, server icons, custom emoji (large when a message is only emoji) and image attachments
come from Discord's CDN and are kept on disk (`<data dir>/cdn`); an attachment whose signed URL expired is renewed first. Unicode emoji
are drawn in colour (`"text": "shaped"` in `zinc.json`). Files: the **+** button, or a file dropped on the window, sends it to the
open channel with Discord's upload flow (the file goes to the storage URL Discord gives, then the message names it). The member list of
a server channel shows on the right, grouped (online, offline, roles), with each member's status. Writing: **Enter** sends, **Shift+Enter** starts a new line; under the pointer a
message offers **Reply**, and on yours **Edit** and **Delete** (click twice); **Up** in an empty box edits your last message, **Escape**
cancels a reply or an edit. Who is typing shows under the box, and you are shown typing to the others while you type. Unread channels are
white, with their count of mentions (servers in the rail too); opening a channel marks it read, as reading it on another device does.
Messages are drawn in Discord's Markdown: bold, italic, underline, strike, inline code and code blocks, quotes, headings, links,
mentions, and spoilers (click to show). Discord's rate limits are honoured: a request waits while its bucket is empty, and a 429 waits
`retry_after`. Not yet: animated emoji and avatars show their first frame, the member list shows its first 100 members. Coming in order
(milestone M28): QR code and password login (ZN-869), notifications (ZN-870), voice (ZN-872), video (ZN-873), screen sharing (ZN-875).

## Layout of `src/`

| File | What it holds |
|---|---|
| `main.tsx` | mounts the app, Escape, the scripted test session |
| `constants.ts` | endpoints (moved by env for the tests), the client identity, channel types, colours |
| `state.ts` | the servers, channels, DMs, messages, read states, who is typing, the member list and the actions (send, reply, edit, delete, ack, send files, older pages); the gateway's dispatches land here |
| `markdown.ts` | Discord's Markdown: blocks and the style runs of their text, custom emoji |
| `members.ts` | the member list: the subscription (op 37) and `GUILD_MEMBER_LIST_UPDATE` (SYNC, INSERT, UPDATE, DELETE, INVALIDATE) |
| `services/cdn.ts` | pictures from the CDN: the disk cache, expired attachment URLs renewed (`attachments/refresh-urls`) |
| `services/upload.ts` | file upload: `POST /channels/{id}/attachments`, then a `PUT` of the bytes to the URL it gives |
| `services/gateway.ts` | the gateway: HELLO, heartbeats and the zombie check, IDENTIFY or RESUME, reconnection with backoff |
| `services/rest.ts` | the HTTP API with the token and identity headers, and the rate-limit buckets |
| `services/identity.ts` | the client properties (IDENTIFY and `X-Super-Properties`) |
| `services/session.ts` | the token in the keychain |
| `components/` | the login, the server rail, the channel list, the messages and the composer, avatars, the member list |

## Test

`tests/t1/discord.sh` runs the app against a fake Discord on 127.0.0.1 (`tests/fake-discord.ts`), no network. By hand:
`DISCORD_API`, `DISCORD_GATEWAY` point it elsewhere, `DISCORD_TOKEN` skips the keychain, `DISCORD_LOG=1` prints what happens,
`DISCORD_DEMO=1` plays the scripted session, `DISCORD_CDN` moves the CDN, `DISCORD_CACHE` the pictures' folder, `DISCORD_UPLOAD_FILE` is
the file the session sends, and `DISCORD_BENCH=1` loads the open channel's whole history and scrolls it to the top and back (frame times
with `ZINC_PROFILE=1`; `FAKE_HISTORY=1997` gives the fake 2,000 messages).
