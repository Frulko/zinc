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

What works now: your servers, their channels (by category) and your DMs; a channel's last 50 messages, and new, edited and deleted
messages as they happen; a dropped connection resumes. Writing: **Enter** sends, **Shift+Enter** starts a new line; under the pointer a
message offers **Reply**, and on yours **Edit** and **Delete** (click twice); **Up** in an empty box edits your last message, **Escape**
cancels a reply or an edit. Who is typing shows under the box, and you are shown typing to the others while you type. Unread channels are
white, with their count of mentions (servers in the rail too); opening a channel marks it read, as reading it on another device does.
Messages are drawn in Discord's Markdown: bold, italic, underline, strike, inline code and code blocks, quotes, headings, links,
mentions, and spoilers (click to show); custom emoji show as `:name:` until ZN-868. Discord's rate limits are honoured: a request waits
while its bucket is empty, and a 429 waits `retry_after`. Coming in order (milestone M28): images and the member list (ZN-868), QR code
and password login (ZN-869), notifications (ZN-870), voice (ZN-872), video (ZN-873), screen sharing (ZN-875).

## Layout of `src/`

| File | What it holds |
|---|---|
| `main.tsx` | mounts the app, Escape, the scripted test session |
| `constants.ts` | endpoints (moved by env for the tests), the client identity, channel types, colours |
| `state.ts` | the servers, channels, DMs, messages, read states, who is typing and the actions (send, reply, edit, delete, ack); the gateway's dispatches land here |
| `markdown.ts` | Discord's Markdown: blocks and the style runs of their text |
| `services/gateway.ts` | the gateway: HELLO, heartbeats and the zombie check, IDENTIFY or RESUME, reconnection with backoff |
| `services/rest.ts` | the HTTP API with the token and identity headers, and the rate-limit buckets |
| `services/identity.ts` | the client properties (IDENTIFY and `X-Super-Properties`) |
| `services/session.ts` | the token in the keychain |
| `components/` | the login, the server rail, the channel list, the messages and the composer |

## Test

`tests/t1/discord.sh` runs the app against a fake Discord on 127.0.0.1 (`tests/fake-discord.ts`), no network. By hand:
`DISCORD_API`, `DISCORD_GATEWAY` point it elsewhere, `DISCORD_TOKEN` skips the keychain, `DISCORD_LOG=1` prints what happens,
`DISCORD_DEMO=1` plays the scripted session.
