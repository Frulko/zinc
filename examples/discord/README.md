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

Log in by scanning the QR code with the Discord app on your phone (You, then Scan QR Code), or with your email and password (then the code
of your authenticator app or one sent by SMS), or paste a token. The token is kept in the keychain, the next start logs in by itself;
**Log out** forgets it. When Discord asks for a captcha the app does not show it: log in with the QR code instead, or once in the
official app. An expired QR code waits for **New code**; nothing is retried by itself.

What works now: your servers, their channels (by category) and your DMs; a channel's history, loaded 50 messages at a time and older
pages as you scroll up, in a virtual list that stays smooth over thousands of messages; new, edited and deleted messages as they happen;
a dropped connection resumes. Pictures: avatars, server icons, custom emoji (large when a message is only emoji) and image attachments
come from Discord's CDN and are kept on disk (`<data dir>/cdn`); an attachment whose signed URL expired is renewed first. Unicode emoji
are drawn in colour (`"text": "shaped"` in `zinc.json`). Files: the **+** button, or a file dropped on the window, sends it to the
open channel with Discord's upload flow (the file goes to the storage URL Discord gives, then the message names it). The member list of
a server channel shows on the right as Discord groups it (hoisted roles, Online, Offline, with their counts), each member with their
presence (online, idle, do not disturb, on a phone) and their name in their role's colour; only the hundreds of rows on screen are asked
for. DMs show the other person's avatar and presence. Writing: **Enter** sends, **Shift+Enter** starts a new line; under the pointer a
message offers **Reply**, and on yours **Edit** and **Delete** (click twice); **Up** in an empty box edits your last message, **Escape**
cancels a reply or an edit. Who is typing shows under the box, and you are shown typing to the others while you type. Unread channels are
white, with their count of mentions (servers in the rail too); a channel is marked read once its end shows (as reading it on another device
does), with a red NEW line above the first message you had not read, and scrolled up, a bar counts what came and **Jump to present** goes
back. A reply's line jumps to the message it answers (the page around it is fetched once when it is older than what is loaded). The pin of
the header lists the channel's pinned messages (a click shows one); **Pin** and **Unpin** are offered in DMs and where your roles allow it
(Manage Messages or Pin Messages). A message's thread and a forum's posts open in a pane beside the channel (its arrow opens them as the
channel, to write).
Messages are drawn in Discord's Markdown: bold, italic, underline, strike, inline code and code blocks, quotes, headings, lists, links,
mentions, slash commands, timestamps (`<t:...>`, in your time zone), and spoilers (click to show). What a message carries is drawn too:
link previews and bots' cards (embeds), GIFs and videos as their picture with a play mark (they open in the browser), videos, sounds,
voice messages and other files with their size, spoiler pictures, stickers, reactions (press one to add yours or take it back; the
thumb under the pointer adds a 👍), polls (press an answer to vote), buttons and menus of bots (shown only: pressing them would send an
interaction), replies (and replies to a deleted message), forwarded messages, answers to slash commands, and system messages (joins,
pins, boosts, calls, threads) as one line; a type the app does not know says "Unsupported message". Threads are listed under their
channel and open like a channel; a forum opens on its posts. Discord's rate limits are honoured: a request waits while its bucket is empty or 50 went in the
last second, a 429 waits `retry_after`, the gateway sends at most 110 messages a minute, and a refusal (a captcha, a verification, a long
429) is shown plainly and pauses the background requests; every request the app makes is listed in
[docs/reports/discord-client-requests.md](../../docs/reports/discord-client-requests.md). Not yet: animated emoji and avatars show their first frame, your own status is not shown. Coming in order
(milestone M28): notifications (ZN-870), voice (ZN-872), video (ZN-873), screen sharing (ZN-875).

## Layout of `src/`

| File | What it holds |
|---|---|
| `main.tsx` | mounts the app, Escape, the scripted test session |
| `constants.ts` | endpoints (moved by env for the tests), the client identity, channel types, colours |
| `state.ts` | the servers, channels, DMs, messages, read states, who is typing, the member list and the actions (send, reply, edit, delete, ack, send files, older pages); the gateway's dispatches land here |
| `markdown.ts` | Discord's Markdown: blocks and the style runs of their text, custom emoji, timestamps |
| `content.ts` | what a message carries besides its text: embeds, reactions, stickers, polls, buttons, threads, system messages |
| `showcase.ts` | the scripted session of #showcase (every kind of content) |
| `permissions.ts` | what the user may do in a channel (the roles' bits and the channel's overwrites): whether pinning is offered |
| `members.ts` | the member list: the subscription (op 37) and `GUILD_MEMBER_LIST_UPDATE` (SYNC, INSERT, UPDATE, DELETE, INVALIDATE) |
| `services/cdn.ts` | pictures from the CDN: the disk cache, expired attachment URLs renewed (`attachments/refresh-urls`) |
| `services/upload.ts` | file upload: `POST /channels/{id}/attachments`, then a `PUT` of the bytes to the URL it gives |
| `services/gateway.ts` | the gateway: HELLO, heartbeats and the zombie check, IDENTIFY or RESUME, reconnection with backoff |
| `services/rest.ts` | the HTTP API with the token and identity headers, and the rate-limit buckets |
| `services/limits.ts` | the sliding windows of the global and gateway limits, the plain errors and when safe mode starts |
| `services/identity.ts` | the client properties (IDENTIFY and `X-Super-Properties`) |
| `services/auth.ts` | the QR code login (the remote-auth gateway, its RSA-OAEP key exchange) and the password login with its two-factor code |
| `services/session.ts` | the token in the keychain |
| `components/` | the login, the server rail, the channel list, the messages and the composer (`MessageView.tsx`), their Markdown (`Markdown.tsx`) and content (`Content.tsx`), avatars, the member list, the pins or a thread beside the messages (`SidePane.tsx`) |

## Test

`tests/t1/discord.sh` runs the app against a fake Discord on 127.0.0.1 (`tests/fake-discord.ts`), no network; `tests/t1/discord_login.sh`
the logins (`tests/login.ts`). By hand: `DISCORD_API`, `DISCORD_GATEWAY`, `DISCORD_REMOTE_AUTH` point it elsewhere, `DISCORD_TOKEN` skips the keychain, `DISCORD_LOG=1` prints what happens,
`DISCORD_DEMO=1` plays the scripted session, `DISCORD_CDN` moves the CDN, `DISCORD_CACHE` the pictures' folder, `DISCORD_UPLOAD_FILE` is
the file the session sends, and `DISCORD_BENCH=1` loads the open channel's whole history and scrolls it to the top and back (frame times
with `ZINC_PROFILE=1`; `FAKE_HISTORY=1997` gives the fake 2,000 messages).
