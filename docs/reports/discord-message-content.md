# Discord message content: inventory for examples/discord (ZN-881)

Research, 2026-10-30. No code changed. Reads: `examples/discord/src/state.ts` (`Message`, `Attachment`, `message()`), `src/markdown.ts`, `src/components/MessageView.tsx`, `src/members.ts`, `tests/fake-discord.ts`, `docs/reports/discord-client-research.md`.
Protocol: gateway v9 / REST v9 as the web client uses them (user account). Test on a secondary account only (ban risk).

Sources (primary first):
- Discord developer docs, bot-oriented but the JSON is shared: https://docs.discord.com/developers/resources/message , .../resources/poll , .../resources/sticker , .../resources/channel , .../topics/gateway-events , .../reference#message-formatting (timestamps, mentions)
- Community user-account docs: https://docs.discord.food/resources/message (message types, flags, embed and attachment objects, snapshots; fetched for this report, first 100k characters of 130k read), https://docs.discord.food/resources/channel , https://docs.discord.food/topics/gateway-events , https://docs.discord.food/resources/poll (discord-userdoccers)
- Uncertain items are marked **(?)**. Not captured from a live account: shapes below are from the docs and from memory of the web client; check each against one real payload (`ZN_REST_LOG` / the rest log of the app) on the secondary account before relying on an optional field.

## 0. What the app does today (summary)

`Message` keeps: id, channelId, author (id, name), content, timestamp, edited, attachments (id, filename, url, size, and width/height only when `content_type` starts with `image/`), replyTo (a string "Name: first 80 chars", only when `referenced_message` is an object), nonce/pending/failed, mentions, mentionsEveryone.
`message()` ignores: `type`, `flags`, `embeds`, `reactions`, `sticker_items`, `poll`, `components`, `message_reference` (alone), `message_snapshots`, `interaction(_metadata)`, `thread`, `webhook_id`/`application_id`, `mention_roles`, `call`, attachment `content_type`/`flags`/`description`/`waveform`/`duration_secs`/`proxy_url`.
`messageUpdated()`: a partial update (no `author`) only copies `content`; so an embed that Discord resolves a second after the message arrives (the usual case for links) would be dropped even once embeds are stored.
Gateway events handled: MESSAGE_CREATE/UPDATE/DELETE, TYPING_START, MESSAGE_ACK, CHANNEL_*, GUILD_*, member list. Not handled: MESSAGE_DELETE_BULK, MESSAGE_REACTION_*, MESSAGE_POLL_VOTE_*, THREAD_*, CHANNEL_PINS_UPDATE.
Markdown drawn: code blocks, `>`/`>>>` quotes, `#`..`###` headings, `-#` subtext, bold/italic/underline/strike, inline code, spoilers, masked links `[t](https://u)`, bare links, `<@id> <#id> <@&id>`, custom emoji. Not drawn: lists, timestamps, `</cmd:id>`, `<id:...>` guild links, `<https://x>` autolinks, `@everyone/@here` highlight, `[t](<url>)`, `[t](url "title")`.
`Channel.readable()` is true only for text, announcement, DM, group DM: threads (types 10-12), forums (15), media (16) cannot be opened. `CH_FORUM = 15` exists; channels of other types are listed or dropped (check `guild()`/`channel()` in state.ts when implementing).
Pictures: `services/cdn.ts` loads a URL to a picture key (`attachmentPicture(url)`, `cdnPicture(key)`); attachment signed-URL refresh exists (`POST /attachments/refresh-urls`, in the fake server). Embed images come from `media.discordapp.net` / external hosts: they go through `picture(key, url)` the same way.

## 1. Message envelope (what every other section hangs on)

```json
{ "id":"1300000000000000001","channel_id":"302","guild_id":"200","type":0,"flags":0,
  "author":{"id":"101","username":"grace","global_name":"Grace","avatar":"av101","bot":false},
  "content":"hello","timestamp":"2026-10-30T09:10:00.000000+00:00","edited_timestamp":null,
  "mentions":[],"mention_roles":[],"mention_everyone":false,"pinned":false,"tts":false,
  "attachments":[],"embeds":[],"reactions":[],"sticker_items":[],"components":[],
  "message_reference":{"type":0,"message_id":"..","channel_id":"302","guild_id":"200"},
  "referenced_message":null,"poll":null,"thread":null,"message_snapshots":[],
  "interaction_metadata":null,"webhook_id":"..","application_id":".." }
```
Optional fields are absent, not null, in many cases. History (REST `GET /channels/{id}/messages?limit&before`) returns the same objects, with `reactions` filled and `referenced_message` resolved (one level).

## 2. Embeds

Message field `embeds: Embed[]` (max 10). Created by Discord's unfurler after the message is sent: MESSAGE_CREATE often has `embeds: []`, then **MESSAGE_UPDATE `{id, channel_id, guild_id, embeds:[...]}`** (partial: no author, no content) arrives within ~1 s. Flag `SUPPRESS_EMBEDS` (1<<2) on the message hides them (set by the author's "x" or by a later MESSAGE_UPDATE `{flags}`).

| Embed field | Type | Note |
|---|---|---|
| `type` | string | `rich`, `image`, `video`, `gifv`, `article`, `link`, `poll_result`, `auto_moderation_message`, `gift`, `post_preview` (others system-only) |
| `title`, `description`, `url` | string | title is a link when `url` set |
| `timestamp` | ISO8601 | shown in the footer after " • " |
| `color` | int RGB | left bar; absent = default grey bar |
| `author` | `{name, url?, icon_url?, proxy_icon_url?}` | |
| `footer` | `{text, icon_url?, proxy_icon_url?}` | |
| `provider` | `{name, url?}` | "YouTube", "Tenor", "Giphy", "Twitter"... shown muted above the title for link/article/video |
| `thumbnail` | `{url, proxy_url, width, height, content_type?, placeholder?, flags?}` | small, top right |
| `image` | same | large, under description/fields |
| `video` | `{url, proxy_url?, width, height}` | playable stream (mp4 for gifv, an embed page `https://www.youtube.com/embed/ID` for YouTube) |
| `fields` | `[{name, value, inline}]` | max 25 |
| `flags` | int | 1<<4 contains explicit media, 1<<5 content inventory, 1<<6 gore, 1<<7 self-harm (blur by default in the official client) |

Examples:
```json
{"type":"rich","title":"Release 1.2","url":"https://x.dev/r","description":"Notes","color":5793266,
 "author":{"name":"CI","icon_url":"https://cdn.discordapp.com/embed/avatars/0.png"},
 "fields":[{"name":"Build","value":"ok","inline":true},{"name":"Tests","value":"412","inline":true}],
 "thumbnail":{"url":"https://x.dev/t.png","proxy_url":"https://images-ext-1.discordapp.net/external/h/https/x.dev/t.png","width":80,"height":80},
 "footer":{"text":"zinc"},"timestamp":"2026-10-30T09:00:00.000Z"}

{"type":"gifv","url":"https://tenor.com/view/cat-12345","provider":{"name":"Tenor","url":"https://tenor.com"},
 "thumbnail":{"url":"https://media.tenor.com/AAA/tenor.png","proxy_url":"https://images-ext-1.discordapp.net/external/h/https/media.tenor.com/AAA/tenor.png","width":498,"height":280},
 "video":{"url":"https://media.tenor.com/AAA/tenor.mp4","proxy_url":"https://images-ext-1.discordapp.net/external/h/https/media.tenor.com/AAA/tenor.mp4","width":498,"height":280}}

{"type":"video","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","title":"Title","description":"...","color":16711680,
 "provider":{"name":"YouTube","url":"https://www.youtube.com"},"author":{"name":"Channel","url":"https://www.youtube.com/channel/UC.."},
 "thumbnail":{"url":"https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg","width":1280,"height":720},
 "video":{"url":"https://www.youtube.com/embed/dQw4w9WgXcQ","width":1280,"height":720}}

{"type":"image","url":"https://x.dev/pic.png","thumbnail":{"url":"https://x.dev/pic.png","proxy_url":"https://images-ext-1.discordapp.net/external/h/https/x.dev/pic.png","width":640,"height":480}}
{"type":"link","url":"https://x.dev","title":"X","description":"...","provider":{"name":"X"}}
{"type":"article","url":"https://news.example/a","title":"..","thumbnail":{...}}
```
Type behaviour in the official client:
- `rich` (bots, webhooks): the card: coloured bar, bg `#2b2d31`, padding ~16, max width 432-516, author row, title, description (Markdown), fields (inline ones side by side, up to 3 per row, else full width), image (max 400x300 scaled), thumbnail 80x80 floating right, footer (icon 20px + text + " • " + date).
- `link`/`article`: same card; provider small above; thumbnail is right (small, if square-ish) or `image` large below. `article` is just a link with an article page (thumbnail on the right).
- `image`: only the picture (the URL in the content is hidden when the content is that URL alone); `thumbnail` holds the image, not `image` (**quirk**: for type image the picture is in `thumbnail`; draw `image ?? thumbnail`).
- `gifv`: a looping silent video (`video.url` mp4) autoplayed, with a GIF badge; the URL text in the content hidden when it is alone. Tenor and Giphy are both `gifv`, only `provider.name` differs. Still frame: `thumbnail.url`.
- `video`: YouTube etc.: thumbnail with a play button; click plays the `video.url` iframe inside the client; card layout like `link`.
- Content hidden when it is just the link: `content` equal to a single URL and all embeds `gifv`/`image` -> don't draw the text (Discord does that, also for `video` in some cases **(?)**).
- `poll_result`, `auto_moderation_message`, `gift`: see sections 6 and 7.

`url` vs `proxy_url`: `url` is the original (the sender's host: leaks the viewer's IP, can die); `proxy_url` is Discord's copy on `images-ext-*.discordapp.net/external/<hash>/<scheme>/<host>/<path>` (external) or `media.discordapp.net/attachments/<channel>/<id>/<file>?ex=..&is=..&hm=..&` (attachments). Always prefer `proxy_url` when present (what the web client does). Size parameters on the media proxy (media.discordapp.net / images-ext): `?width=W&height=H` (resize keeping ratio, fits inside), `&format=webp|png|jpeg` (default is the source format; webp is smallest), `&quality=lossless|high|...` **(?)**, `&animated=true|false` (webp only: false gives the first frame, the cheap way to get a GIF still). Request about 2x the drawn size, capped by `width/height` of the object. Signed `ex/is/hm` params must be kept (see `attachmentKey` and refresh-urls in cdn.ts). No size parameters work on `cdn.discordapp.com` for attachments (full file).
Today: not handled at all (embeds ignored, and MESSAGE_UPDATE partial drops them).
Draw: `Embed(e)` = `<View className="mt-1 self-start max-w-[432] flex-row rounded bg-[#2b2d31]">` with a `<View className="w-[4]" style bg=color>` bar, a column of Texts (reuse `Paragraph` for the description so Markdown/mentions/emoji work; fields as a wrap row of `basis` cells), `<Image>` at known `w x h` (same fitting code as `Media`); `video`/`gifv` first as the thumbnail with a `play` Icon overlay and a press that opens `video.url`/`url` (system open), animate only if the zinc video plugin plays mp4 inline **(?)**.

## 3. Attachments

```json
{"id":"1","filename":"clip.mp4","title":"My clip","description":"alt text","content_type":"video/mp4","size":1048576,
 "url":"https://cdn.discordapp.com/attachments/302/9/clip.mp4?ex=..&is=..&hm=..&","proxy_url":"https://media.discordapp.net/attachments/302/9/clip.mp4?ex=..&is=..&hm=..&",
 "width":1280,"height":720,"flags":0,"ephemeral":false}
```
Extra for voice messages (message `flags & (1<<13)`, content empty, one attachment): `"filename":"voice-message.ogg","content_type":"audio/ogg","duration_secs":4.2,"waveform":"<base64, 1 byte per sample, up to 256 samples, value 0-255>"`.
Attachment `flags`: 1<<0 clip, 1<<1 thumbnail, 1<<2 remix, 1<<3 spoiler, 1<<4 explicit, 1<<5 animated, 1<<6 gore, 1<<7 self-harm. `content_type` can be absent on old uploads: fall back to the filename extension.

| Kind | Official client | Today | Draw |
|---|---|---|---|
| image (png/jpg/webp/gif) | inline at ratio, max ~550x400, click = lightbox; GIF animates, badge "GIF" | handled (png etc. via `width/height`; GIF shown as a still or animated per `Image`) **(?)** | existing `Media` |
| video | inline player with controls, thumbnail from `proxy_url?format=jpeg` | link "KB" only | box of `width x height` (max 400x300), dark bg, `play` Icon, filename + size, press opens the file; real player if the video plugin can play a URL |
| audio (mp3, ogg, wav) | a file card with a player, name, size, seek bar | link | card: `play` Icon + filename + size; press opens/plays |
| voice message | pill: play button, waveform bars, duration "0:04" | link (content empty) | row: play circle, `N` bars from decoded waveform (`height = 4 + v/255*20`), duration text; playback only if ogg/opus decodes **(?)**, else press opens the file |
| other file | card: type icon, name (link), size "12.3 KB"/"MB", download | handled (paperclip card, KB only) | add MB formatting and an icon per extension (optional) |
| spoiler | filename starts `SPOILER_` (and flag 1<<3 on new payloads): image blurred with "SPOILER" pill until clicked | not handled (shown in clear) | reuse `store.revealed` (per message id): grey `View` of the same box with text "SPOILER" until pressed |
| alt text | `description`, shown by screen readers and the "ALT" badge; a tooltip | ignored | `aria-label={a.description !== '' ? a.description : a.filename}` (already aria-labelled with filename) |
| ephemeral | `ephemeral:true` on the attachment and message flag 1<<6: only the invoker sees it ("Only you can see this • Dismiss") | n/a | only comes from an interaction response; draw the muted line "Only you can see this" |
| clip / thumbnail / remix | flags above; thumbnail attachments are not drawn on their own | n/a | skip `is_thumbnail` |
Layout: several media are a grid (1: single; 2: side by side; 3: one big + two; 4: 2x2; 5-10: rows) with the official client; a column of the existing `Media` is acceptable as step one.

## 4. Reactions

Message field `reactions: [{ "count":3, "count_details":{"burst":1,"normal":2}, "me":true, "me_burst":false, "emoji":{"id":null,"name":"👍"}, "burst_colors":["#ff0000"] }]` (custom emoji: `{"id":"77","name":"zinc","animated":false}`). Order = first reaction time. Only present when the message has some.

Gateway (dispatches; user needs the channel subscribed/visible):
| Event | d |
|---|---|
| MESSAGE_REACTION_ADD | `{user_id, channel_id, message_id, guild_id?, member?, emoji, burst:bool, burst_colors?, type: 0 normal / 1 burst, message_author_id?}` |
| MESSAGE_REACTION_REMOVE | `{user_id, channel_id, message_id, guild_id?, emoji, burst, type}` |
| MESSAGE_REACTION_REMOVE_ALL | `{channel_id, message_id, guild_id?}` (clear all) |
| MESSAGE_REACTION_REMOVE_EMOJI | `{channel_id, message_id, guild_id?, emoji}` (clear one emoji) |
Client bookkeeping: ADD -> find/create the entry by emoji key (`id ?? name`), `count++`, and `me = true` when `user_id === me.id` (burst: `count_details.burst++`, `me_burst`); REMOVE -> `count--`, drop at 0, clear `me` for me; REMOVE_ALL -> `reactions = []`; REMOVE_EMOJI -> drop that entry.
REST (user): `PUT /channels/{c}/messages/{m}/reactions/{emoji}/@me?location=Message&type=0` (204; `type=1` for a super reaction, costs Nitro boosts) and `DELETE` the same path (`.../@me`) to remove; `DELETE .../reactions/{emoji}/{user_id}` removes another's (needs Manage Messages); `GET .../reactions/{emoji}?limit=&type=` lists who. `{emoji}` is the URL-encoded unicode char (`%F0%9F%91%8D`) or `name:id` for a custom one (`zinc:77`, animated: `a:` not used here). Rate limit is strict (about 1 per 0.25 s per channel, 429 with `retry_after`; see the 429 handling already in the app's rest layer).
Today: nothing. Official: pills under the message: emoji (22px) + count; mine = blurple border/bg `#3b405a` with `#5865f2` border; hover tooltip with names; "add reaction" smiley on hover; burst reactions have an animated glow (draw as a normal pill with a star).
Draw: `<View className="flex-row flex-wrap gap-1 mt-1">` of pills `px-2 py-[2] rounded-lg border` containing `<Emoji id size=16>` (existing component, for custom) or a `<Text>` for unicode, and the count; `onPress` toggles through `store.react(m, r)` (PUT or DELETE by `me`), optimistic update then the echo corrects it. Choosing an emoji from a picker is out of scope; adding = pressing an existing pill (plus, later, a small fixed list).

## 5. Stickers

Message field `sticker_items: [{id, name, format_type}]` (the older `stickers` full objects are gone). Content usually empty.
`format_type`: 1 PNG, 2 APNG, 3 LOTTIE, 4 GIF.
| Format | URL | Draw |
|---|---|---|
| PNG (1), APNG (2) | `https://cdn.discordapp.com/stickers/{id}.png?size=160` (APNG animates in the same file; the app shows the first frame if its decoder does not animate) | `<Image>` 160x160 (official: 160) |
| LOTTIE (3) | `https://cdn.discordapp.com/stickers/{id}.json` (a Lottie JSON; also `.png` is NOT available for Lottie on the CDN **(?)**) | the `lottie` plugin exists in `plugins/`; if usable, play it; else show `name` in a muted pill ":name:" |
| GIF (4) | `https://media.discordapp.net/stickers/{id}.gif?size=160` (also `cdn.discordapp.com/stickers/{id}.gif`) | `<Image>` (animated if the image decoder animates GIF) |
Add `stickerKey(id, format)` to cdn.ts next to `emojiKey`. Today: not handled (a sticker-only message looks empty).

## 6. Polls

Message field `poll`:
```json
{"question":{"text":"Lunch?"},
 "answers":[{"answer_id":1,"poll_media":{"text":"Pizza","emoji":{"name":"🍕"}}},{"answer_id":2,"poll_media":{"text":"Sushi"}}],
 "expiry":"2026-10-31T09:00:00.000000+00:00","allow_multiselect":false,"layout_type":1,
 "results":{"is_finalized":false,"answer_counts":[{"id":1,"count":3,"me_voted":true},{"id":2,"count":1,"me_voted":false}]}}
```
`results` may be absent on a fresh poll (all zero). `layout_type` 1 = default (the only one). The message `type` is 0, content empty, the poll is the content.
Voting (user client; per userdoccers): `PUT /channels/{c}/polls/{m}/answers/@me` body `{"answer_ids":["1"]}` (strings in the web client **(?)**; empty list removes the vote; one id when not multiselect); `POST /channels/{c}/polls/{m}/expire` ends it (author only); `GET /channels/{c}/polls/{m}/answers/{answer_id}?limit=&after=` lists voters.
Gateway: `MESSAGE_POLL_VOTE_ADD` / `MESSAGE_POLL_VOTE_REMOVE`: `{user_id, channel_id, message_id, guild_id?, answer_id}`. Update `answer_counts` (`count++/--`, `me_voted` when `user_id === me.id`). Also the final MESSAGE_UPDATE with `results.is_finalized:true`.
Ending: a new message **type 46 POLL_RESULT** (embed `type:"poll_result"` with `fields` named `poll_question_text`, `victor_answer_votes`, `total_votes`, `victor_answer_id`, `victor_answer_text`, `victor_answer_emoji_name`...; `message_reference` -> the poll) which the client shows as "The poll has closed" card: "Pizza won with 3 votes (75%)".
Official: card with the question (bold), "Select one answer" / "Select one or more answers", rows with radio/checkbox, emoji, text, and after voting or end: a bar proportional to the share, count, percent; footer "4 votes • 23 hours left" / "Poll closed"; "Vote" button (multiselect) or instant for single; "Show results" for non-voters.
Today: not handled. Draw: a bordered `View` card, rows as `View` with an absolutely positioned bar (`w-[${pct}%]` or measured px) behind the label; radio = a ring `View`; `onPress` -> `store.vote(m, answerId)` (optimistic; multiselect keeps a local selection and a "Vote" button).

## 7. Message types

Field `type` (int). Source: docs.discord.food message types. System messages have no author-written content; the client draws an icon + sentence with the author's name (bold) and a timestamp, no avatar. Texts are the web client's (English; paraphrased from the official client, exact wording is client-side and not in the API; **(?)** for the rare ones).
| # | Name | Shown as |
|---|---|---|
| 0 | DEFAULT | normal message |
| 1 | RECIPIENT_ADD | "{author} added {mentions[0]} to the group." (thread: "... to the thread.") |
| 2 | RECIPIENT_REMOVE | "{author} removed {mentions[0]} from the group." (same user: "{x} left the group.") |
| 3 | CALL | `call:{participants:[ids], ended_timestamp}`: "{author} started a call." / ended: "{author} started a call that lasted 3 minutes." / missed: "You missed a call from {author}." |
| 4 | CHANNEL_NAME_CHANGE | "{author} changed the channel name: {content}" |
| 5 | CHANNEL_ICON_CHANGE | "{author} changed the group icon." |
| 6 | CHANNEL_PINNED_MESSAGE | "{author} pinned a message to this channel. See all pinned messages." (`message_reference.message_id` = the pinned message) |
| 7 | USER_JOIN | one of 13 welcome sentences chosen by the message time: e.g. "{author} joined the party.", "{author} just showed up!", "A wild {author} appeared." (**(?)** exact list; one fixed "{author} joined the server." is acceptable) |
| 8 | PREMIUM_GUILD_SUBSCRIPTION | "{author} just boosted the server!" (`content` may carry the count: "... boosted the server 2 times!") |
| 9, 10, 11 | ..._TIER_1/2/3 | "{author} just boosted the server! {guild} has achieved Level 1/2/3!" |
| 12 | CHANNEL_FOLLOW_ADD | "{author} has added {content} to this channel. Its most important updates will show up here." |
| 14-17 | GUILD_DISCOVERY_* | "This server has been removed from Server Discovery because it no longer passes all the requirements." etc. (rare) |
| 18 | THREAD_CREATED | "{author} started a thread: {content=name}. See all threads." (`flags HAS_THREAD`, `thread` object on the message; press opens it) |
| 19 | REPLY | normal message with `message_reference` + `referenced_message` (header line, see below) |
| 20 | CHAT_INPUT_COMMAND | slash command reply: normal body, header "{user} used /{name}" from `interaction(_metadata)` |
| 21 | THREAD_STARTER_MESSAGE | first row of a thread: the parent message (`referenced_message`) drawn as a normal message with a thread header; `content` empty |
| 22 | GUILD_INVITE_REMINDER | "Wondering who to invite? Start by inviting anyone who can help you build the server!" (rare) |
| 23 | CONTEXT_MENU_COMMAND | like 20, header "{user} used {name}" |
| 24 | AUTO_MODERATION_ACTION | content = "{rule} blocked a message in #chan"; embed `type:"auto_moderation_message"` with fields `rule_name`, `channel_id`, `keyword`, `keyword_matched_content`; visible only to moderators; draw the content + embed card |
| 25 | ROLE_SUBSCRIPTION_PURCHASE | `role_subscription_data:{tier_name,total_months_subscribed,is_renewal}`: "{author} joined {tier_name} and has been a subscriber of {guild} for N months!" |
| 26 | INTERACTION_PREMIUM_UPSELL | skip |
| 27-31 | STAGE_START/END/SPEAKER/RAISE_HAND/TOPIC | "{author} started {content}" / "ended {content}" / "is now a speaker" / "requested to speak" / "changed the Stage topic: {content}" |
| 32 | GUILD_APPLICATION_PREMIUM_SUBSCRIPTION | "{author} upgraded {application} to premium for this server!" |
| 35 | PREMIUM_REFERRAL | skip |
| 36-39 | GUILD_INCIDENT_* | "{author} enabled security actions until ..." / "disabled" / "reported a raid" / "resolved an incorrect report" |
| 40 | GUILD_DEADCHAT_REVIVE_PROMPT | skip (local prompt) |
| 44 | PURCHASE_NOTIFICATION | "{author} bought {product}" **(?)** |
| 46 | POLL_RESULT | card from the embed, see 6 |
| 47 | CHANGELOG | embed card |
| 48,50,51,66 | local-only prompts | never drawn |
| 52-54 | GUILD_JOIN_REQUEST_* | "Your request to join was accepted/rejected/withdrawn" |
| 55 | HD_STREAMING_UPGRADED | "{author}'s HD streaming was activated" |
| 58-62 | REPORT_TO_MOD_* | moderator-only notices |
| 64 | PREMIUM_GROUP_INVITE | embed |
| 65 | VOICE_SESSION | "{author} started a voice session" |
| 67 | FRIEND_REQUEST_ACCEPTED | "{author} and you are now friends!" |
Unknown type: draw "Unsupported message" in muted italics (Discord does the same for types it does not know), never the empty row. Rule: types 0, 19, 20, 21, 23 (+ 24, 46, 47, 64 with embeds) are bodies; all others are one-line system rows. The `author` of a system row is the user who triggered it.

### Replies
Type 19 (or 20/23) with `message_reference:{message_id, channel_id}`:
- `referenced_message` is an object: header "↱ avatar Name  first line of content" (today: `replyTo` = "Name: first 80 chars", one muted line; ok; add: attachment-only target shows "Click to see attachment", empty content + embed "Click to see attachment").
- `referenced_message: null` with `message_reference.message_id` present: the target was **deleted** -> header "Original message was deleted" (muted, italic). Today: `referenced_message === null` leaves `replyTo = ''`, so a reply to a deleted message looks like a plain message. Fix: `if (r === null && m.message_reference !== undefined) out.replyTo = 'Original message was deleted'`.
- `referenced_message` **absent** (key missing) with a `message_reference`: not loaded (older than the fetched window / other channel); official shows "Unable to load message"/loads it on demand (`GET /channels/{c}/messages?around={id}&limit=1`).
- Reply ping: `mentions` includes the replied author (and the client shows "@" toggle); nothing to draw.

### Forwarded messages
`message_reference:{type:1, message_id, channel_id, guild_id}` and `message_snapshots:[{message:{content, timestamp, edited_timestamp, mentions, mention_roles, attachments, embeds, type, flags, components, sticker_items}}]` (only one snapshot at present); message `flags & (1<<14)` HAS_SNAPSHOT; the forwarder's own `content` is empty (or a comment). Official: a box with a left bar, header "↱ Forwarded", the snapshot's body, and a muted footer "#channel • date" (the source, link). Today: shows an empty row. Draw: a nested `Body`/`Media`/`Embed` on the snapshot object (make `Message` build from `snapshot.message` so the same components render both), inside the quote-bar container (existing `K_QUOTE` style).

### Flags
| Bit | Name | Effect |
|---|---|---|
| 1<<0 | CROSSPOSTED | published to followers; badge "Published" (ignore) |
| 1<<1 | IS_CROSSPOST | came from a followed channel: header "Crossposted from #x" (`message_reference` = source) |
| 1<<2 | SUPPRESS_EMBEDS | do not draw `embeds` |
| 1<<3 | SOURCE_MESSAGE_DELETED | crosspost source gone: "The source message was deleted" |
| 1<<4 | URGENT | system DM from Discord; mark in red **(?)** |
| 1<<5 | HAS_THREAD | the message has a thread (`thread` object): draw the thread chip (section 8) |
| 1<<6 | EPHEMERAL | only you; "Only you can see this" |
| 1<<7 | LOADING | interaction response pending ("{app} is thinking..."): draw "{app} is thinking…" |
| 1<<8 | FAILED_TO_MENTION_SOME_ROLES_IN_THREAD | skip |
| 1<<12 | SUPPRESS_NOTIFICATIONS | "@silent": no ping; official shows a small bell-off icon; notifications should respect it (check notify.ts) |
| 1<<13 | IS_VOICE_MESSAGE | voice message (section 3) |
| 1<<14 | HAS_SNAPSHOT | forwarded |
| 1<<15 | IS_COMPONENTS_V2 | message built from v2 components (section 9): content/embeds are ignored by the server |

## 8. Threads and forums

Channel types: 10 ANNOUNCEMENT_THREAD, 11 PUBLIC_THREAD, 12 PRIVATE_THREAD, 15 GUILD_FORUM, 16 GUILD_MEDIA (13 stage, 14 directory). A thread is a channel: `{id, type:11, guild_id, parent_id, name, owner_id, message_count, member_count, last_message_id, total_message_sent, thread_metadata:{archived, auto_archive_duration, archive_timestamp, locked, create_timestamp}, applied_tags:[tagId], flags, member?}`. Its messages: the same REST/gateway (`GET /channels/{thread}/messages`, MESSAGE_CREATE with `channel_id = thread id`), subscribe like a channel; `ack` the same.
Gateway: `THREAD_CREATE` (also sent to the creator as `newly_created:true`), `THREAD_UPDATE`, `THREAD_DELETE {id, guild_id, parent_id, type}`, `THREAD_LIST_SYNC {guild_id, channel_ids?, threads:[...], members:[...]}` (when the client gains access to a channel; on user accounts also each GUILD_CREATE carries a `threads` array of the active threads), `THREAD_MEMBER_UPDATE`, `THREAD_MEMBERS_UPDATE`. Op 37 already sends `threads:true` (members.ts).
Listing: active threads of a guild = `GUILD_CREATE.threads` (+ THREAD_CREATE/LIST_SYNC after); archived ones: `GET /channels/{parent}/threads/search?sort_by=last_message_time&sort_order=desc&limit=25&offset=0&archived=true` (the web client's endpoint **(?)**; the documented bot one is `GET /channels/{parent}/threads/archived/public?before=&limit=`). Opening an archived thread unarchives it only on send.
Forums (15) and media (16) channels: no messages of their own; the "channel" is a list of posts (= threads whose id equals the starter message id). Channel fields: `available_tags:[{id,name,moderated,emoji_id,emoji_name}]`, `default_sort_order` (0 latest activity, 1 creation date), `default_forum_layout` (0 not set, 1 list, 2 gallery), `flags` (1<<4 REQUIRE_TAG), `topic` (guidelines). Posts list: `GET /channels/{forum}/threads/search?sort_by=last_message_time|creation_time&sort_order=desc&tag=&limit=25&offset=0&archived=false` -> `{threads:[...], members, first_messages:[message...], has_more, total_results}` (**(?)** user-only endpoint, as the web client calls it; first_messages gives the preview text and image). Post: `thread.applied_tags`, `thread.flags & (1<<1)` PINNED, `message_count`, preview = `first_messages`. Official: a list of cards with title, tag pills, first-message excerpt, a thumbnail, "N replies • last activity".
Where they show up in a text channel: (a) message type 18 + `thread` on the message with `flags HAS_THREAD`: a chip under the message "Thread name • N messages • last message time" with the `thread` icon; (b) the channel list shows active threads under their parent channel (indented); (c) type 21 starter row at the top of the thread.
Today: `Channel.readable()` false for them, THREAD_* ignored. Draw: ChannelList: add child rows (indent 16, `thread` Icon) under the parent from the active threads; make `readable()` true for types 10-12; for 15/16 a `ForumView` (VirtualList of post cards; press = `store.open(threadId)`); the message-row chip as a pressable `View`. Add `CH_PUBLIC_THREAD = 11` etc. to constants.ts. Parent id of a thread comes in `parent_id`, which the `Channel` class already keeps.

## 9. Components (buttons, selects)

Message field `components: [{type:1, components:[...]}]` (action rows, max 5 per message; 5 buttons or 1 select per row).
| type | name | key fields |
|---|---|---|
| 1 | action row | `components` |
| 2 | button | `style` 1 primary (blurple), 2 secondary (grey), 3 success (green), 4 danger (red), 5 link (grey + external icon; has `url`, no `custom_id`), 6 premium (`sku_id`); `label`, `emoji`, `custom_id`, `disabled` |
| 3 | string select | `custom_id`, `options:[{label,value,description,emoji,default}]`, `placeholder`, `min_values`, `max_values`, `disabled` |
| 5, 6, 7, 8 | user / role / mentionable / channel select | `default_values`, `channel_types` |
| 4 | text input | only inside modals (interaction response type 9) |
Components v2 (message flag 1<<15): 9 section, 10 text display, 11 thumbnail, 12 media gallery, 13 file, 14 separator, 17 container (accent colour, spoiler), 18 label (modal). Rendered as a layout instead of content/embeds.
Interacting (not just reading): `POST /interactions` multipart `payload_json`: `{type:3, application_id, channel_id, guild_id, message_id, message_flags, session_id, nonce, data:{component_type:2, custom_id}}` (select: `values:[..]`); the bot answers via an interaction response which appears as a message update / a new message; **(?)** if a user-account client needs more fields; this is the most fingerprinted request (ban risk). Recommendation: draw buttons and selects **read-only first** (visible, disabled look = pressable look but no action), link buttons open the URL (safe), `custom_id` buttons interactive only in a later step on the secondary account. Draw: row `flex-row flex-wrap gap-2` of `View` buttons `px-4 py-[6] rounded` with colour by style and a label (+ `Emoji`); select = a bordered `View` with placeholder and a chevron icon (no dropdown at first). Today: ignored.

## 10. Interactions metadata

Slash/context command replies: `interaction_metadata:{id, type (2 APPLICATION_COMMAND, 3 MESSAGE_COMPONENT, 5 MODAL_SUBMIT), user:{..}, authorizing_integration_owners:{..}, original_response_message_id?, interacted_message_id?, name?, command_type?}` and the older `interaction:{id, type, name:"roll", user:{...}}` (both can be present; web client reads either). The message itself is authored by the bot (`author.bot:true`, `application_id`) with `type` 20 (slash) or 0/19 (component follow-ups; 23 context menu). Official: above the message, small: bot's avatar... no: the **invoking user's** avatar + "{user} used /{name}" (name coloured as a link), then the bot message with its name + "APP" tag (`author.bot` -> badge; `flags` verified). Today: not shown (body shows, header lacks). Draw: reuse the reply header slot: `Text className="pl-14 text-xs muted"` "↱ {user} used /name"; add an "APP" pill beside the author when `author.bot`.

## 11. Mentions and links not yet drawn

| Syntax | Meaning | Draw |
|---|---|---|
| `</name:id>`, `</name sub:id>`, `</name sub group:id>` | clickable slash command (id = command id) | mention-coloured chip "/name sub"; press: none (or fill composer) |
| `<id:customize>`, `<id:browse>`, `<id:guide>`, `<id:home>` | guild navigation links (Channels & Roles, Browse Channels, Server Guide, Server Home) | chip with the label |
| `<@&id>` role | handled; official uses the role's colour (needs role colour: `Guild.roles` stores only names) | add colour later |
| `<#id>` channel | handled (`#name`), unknown shows `#unknown-channel`; cross-server ones use `mention_channels` (`{id, guild_id, type, name}`) | optional |
| `@everyone`, `@here` | chip when `mention_everyone` | draw as mention role (text-colour only) |
| `<https://x>` | autolink, no embed | strip the angle brackets (today `<` stops a bare link but the `<` stays visible **(?)** check) |
| `[t](<https://x>)`, `[t](https://x "title")` | masked link variants | accept `<..>` and drop `"title"` |
| `<t:unix[:style]>` | timestamp | see below |
| Unicode emoji | platform font | plain text, fine; `:name:` shortcodes are not expanded server-side |

Discord timestamps `<t:1618953630:F>` (unix seconds, local time zone of the viewer; no style = `f`). en-US output for 2021-04-20 20:20:30 local (flag: output):
| Style | Name | Output (en-US) |
|---|---|---|
| `t` | short time | 8:20 PM |
| `T` | long time | 8:20:30 PM |
| `d` | short date | 04/20/2021 |
| `D` | long date | April 20, 2021 |
| `f` (default) | short date/time | April 20, 2021 at 8:20 PM |
| `F` | long date/time | Tuesday, April 20, 2021 at 8:20 PM |
| `R` | relative | "2 months ago", "in 3 hours", "a few seconds ago" (updates live) |
| `s`, `S` | short date + short/long time (newer, in userdoccers) **(?)** | 04/20/2021, 8:20 PM / 8:20:30 PM |
The official client draws it as a muted chip (bg `#ffffff0f`, rounded 3, px 2) with a tooltip of the full date. Invalid number -> the raw text. Locale: the app sends `en-US` (`LOCALE`), so use these forms; compute by hand (month/day names table + `Date` getters) unless `Intl` is available in all three engines **(?)**.
Add to `markdown.ts` inline: a new role `R_TIME` (or `R_MENTION` colouring) whose text is formatted at parse time; `R` needs a re-render timer (store tick each minute) or is formatted once (ponytail).

## 12. Markdown not yet drawn

| Feature | Discord rule | Today |
|---|---|---|
| Unordered list | line starts with `- ` or `* ` (space); indent by 2+ spaces nests (2 levels drawn); bullet "•" | drawn as the raw text "- item" |
| Ordered list | `1. ` .. `99. ` at line start; the number shown as written | raw |
| Heading | `# `, `## `, `### ` at line start only (level 4+ is plain text); no inline marks need escape | handled (levels 1-3) |
| Subtext | `-# text` at line start | handled |
| Block quote | `> ` single line; consecutive `> ` lines are one quote; `>>> ` quotes to the end | handled (checked in `lines()`) |
| Masked link | `[text](https://u)`; text can hold marks; embeds are not created for it | handled, plain text only; `<url>` and title forms not |
| Code block | ```` ```lang\n...``` ```` | handled (no syntax colours; fine) |
| Escapes | `\*` etc. | handled |
| Underscore italic inside words | `snake_case` not italic | handled |
Lists need only a `K_LIST` kind in `lines()` (consecutive list lines make one block; per line: depth = leading spaces / 2, marker; drawn as rows `View flex-row` with a fixed-width marker Text "•" or "1." and a `Paragraph`). Everything else above is done.

## 13. Other things a message can carry

- Webhooks / bots: `author.bot`, `webhook_id`: "APP" tag next to the name (section 10).
- `pinned: true` and CHANNEL_PINS_UPDATE: pin icon on hover (optional).
- Edits: MESSAGE_UPDATE partial must merge (embeds, flags, reactions? no, poll results, components, attachments): extend the partial branch to copy every present key (see section 0).
- MESSAGE_DELETE_BULK `{ids, channel_id}`: remove all (today ignored).
- Guild invites in content: an embed `type:"link"` in older clients, and in the web client an "invite card" built from the URL (client side). Skip.
- Activity / Spotify listen-along invites (`activity`, `application`): skip.
- Message `call` (type 3) timing: `ended_timestamp` null while ongoing.

## 14. Suggested implementation order (most visible first)

1. **Message model**: add `type`, `flags`, `embeds`, `reactions`, `stickers`, `poll`, `components`, `snapshot` (a `Message` of its own), `referenceDeleted` to `Message`; make the partial MESSAGE_UPDATE merge every present key. (Everything below reads these.)
2. **System messages** (types other than 0/19/20/21/23): one-line rows + "Unsupported message" fallback. Cheap, and removes empty rows. Include reply to deleted ("Original message was deleted").
3. **Embeds** (link/article/rich/image/video/gifv): the card, thumbnails/images with `proxy_url` and `?width&height&format=webp`; GIF/Tenor/YouTube as a still + play icon + open-in-browser; hide a bare-URL content when every embed is gifv/image.
4. **Reactions**: render + REACTION_ADD/REMOVE/REMOVE_ALL/REMOVE_EMOJI + toggle by press (PUT/DELETE).
5. **Attachments by kind**: video/audio/voice message/file cards with size (MB), spoiler blur, alt text.
6. **Stickers** (PNG/APNG/GIF first, Lottie as name pill, then plugin).
7. **Markdown**: lists, `<t:...>` timestamps, `</cmd:id>`, autolinks.
8. **Forwarded messages** (snapshot render) and interactions header + APP tag.
9. **Polls**: render + vote REST + POLL_VOTE events + type 46 result card.
10. **Threads and forums**: chip on the message, active threads under their channel, open threads, ForumView.
11. **Components**: read-only buttons/selects, link buttons open; interactive (`POST /interactions`) last and only on the secondary account.

## 15. Fake-server fixtures to add (tests/fake-discord.ts) for the T1 session

Add a dedicated channel `#showcase` (`id 305`, type 0, in guild 200, `last_message_id` its last) served by `GET /channels/305/messages` from a `showcase: any[]` list, one message each (ids 1000-1030, authors Grace/Linus/a bot `{id:'900', bot:true, username:'rollbot'}`), plus the gateway pushes noted:
| id | Fixture |
|---|---|
| 1000 | rich embed: title+url, description with Markdown, colour, author, 2 inline fields + 1 full, thumbnail, image, footer, timestamp (image/thumbnail URLs on `/cdn/` served by the existing PNG) |
| 1001 | content = a link; MESSAGE_CREATE with `embeds:[]`, then a **MESSAGE_UPDATE partial** `{id, channel_id, embeds:[link embed with provider+thumbnail]}` 200 ms later |
| 1002 | gifv Tenor embed (`video` mp4 URL on `/cdn/` returns the PNG: only the thumbnail is drawn) and content = the bare tenor URL (must be hidden) |
| 1003 | YouTube `video` embed (thumbnail, `video.url` embed page) |
| 1004 | attachments: `video/mp4` (1280x720, size 12 MB), `audio/mpeg`, `application/pdf` (size 2.5 MB), an image with `description` (alt) |
| 1005 | `SPOILER_photo.png` image attachment (flag 1<<3) |
| 1006 | voice message: flags 8192, `audio/ogg`, `duration_secs 4.2`, `waveform` base64 of 64 bytes |
| 1007 | reactions: 👍 count 3 `me:true`, custom `zinc:77` count 1; plus gateway MESSAGE_REACTION_ADD (user 101, 🎉) and REMOVE (user 100 on 👍) pushed after the first history request; the PUT/DELETE endpoints return 204 and log `reaction PUT/DELETE` and dispatch the echo |
| 1008 | sticker_items for each format 1, 2, 3, 4 (CDN `/cdn/stickers/..` serves the PNG; lottie json 404) |
| 1009 | poll (2 answers, `me_voted` none, expiry in the future); `PUT /channels/305/polls/1009/answers/@me` -> 204 and dispatches MESSAGE_POLL_VOTE_ADD for user 100; then type-46 result message 1010 with the `poll_result` embed |
| 1011-1016 | system messages: type 7 (join), 8 (boost), 6 (pin, with `message_reference` to 1000), 18 (thread created, with `thread` {id 306, name "release talk", message_count 4}, flags 32), 3 (call, `call:{participants:['101'], ended_timestamp}`), 4 (rename, content "new-name") |
| 1017 | reply (type 19) to 1000 (`referenced_message` object); 1018 reply to a deleted one: `message_reference` set, `referenced_message: null` |
| 1019 | forward: `message_reference:{type:1,...}`, flags 16384, `message_snapshots:[{message:{content, attachments:[photo], embeds:[]}}]` |
| 1020 | slash command reply: type 20, bot author, `interaction_metadata:{type:2,name:"roll",user:Grace}`, content "rolled 4" |
| 1021 | components: row with a primary, a link and a disabled danger button, and a string select (placeholder "Pick") |
| 1022 | content stress: `- a\n  - b\n1. one`, `<t:1793352000:F>`, `<t:1793352000:R>`, `</roll dice:555>`, `[m](<https://example.com>)`, `# H1\n## H2\n-# small`, `> a\n> b` |
| 1023 | `type:99` (unknown) -> "Unsupported message" |
| 1024 | forum + thread setup: channel 307 type 15 (`available_tags`), thread 306 (type 11, parent 305) and 308 (type 11, parent 307, `applied_tags`), in `GUILD_CREATE.threads`; `GET /channels/306/messages` returns the starter (type 21) + 2 messages; `GET /channels/307/threads/search` returns `{threads:[308], first_messages:[..], has_more:false}`; then a gateway `THREAD_CREATE` for a new thread |
Golden frame: open #showcase in the T1 session, `ZINC_SHOT` once at the top (embeds) and once scrolled (rest), or one tall frame if the window allows; log lines for the rest (`reaction`, `poll vote`, `thread opened`, the `describe()` of the markdown block) in the app's test log as it does for `message in ...`, so most checks are text and only one golden is a picture. Dispatch the extra events after the first `GET /channels/305/messages`, like `pushedFirst` does.
