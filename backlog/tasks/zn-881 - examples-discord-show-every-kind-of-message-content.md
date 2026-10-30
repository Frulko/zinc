---
id: ZN-881
title: 'examples/discord: show every kind of message content'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 19:10'
updated_date: '2026-10-30 20:19'
labels:
  - ui
  - size-L
milestone: m-28
dependencies:
  - ZN-880
ordinal: 575460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-10-30: improve how conversations show the many kinds of content Discord sends. Start from docs/reports/discord-message-content.md (the inventory of message content types, their JSON and what the client handles). Test on a secondary account only (the owner's ban risk).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Embeds: link previews, rich embeds (title, description, fields, colour bar, thumbnail, image, footer, author) and video/GIF embeds (Tenor, YouTube: their picture and a link)
- [x] #2 Reactions (unicode and custom emoji, counts, mine highlighted, add and remove), stickers, polls (read and vote)
- [x] #3 System messages (joins, pins, boosts, thread created, calls), replies to deleted messages, forwarded messages, threads and forum posts listed and opened
- [x] #4 Attachments that are not pictures: video and audio with a player or a link, files with size; Discord timestamps <t:...> and the remaining Markdown (lists, masked links, headings) drawn
- [x] #5 A T1 session over the fake server shows one message of each kind; one golden frame
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-30 (worktree agent). Every kind of content of docs/reports/discord-message-content.md is drawn: rich/link/article embeds (colour bar, provider, author, title link, description in Markdown, fields, thumbnail, image, footer), video/GIF embeds (YouTube, Tenor: picture with a play mark, opens the link), video/audio/file attachments (picture + play for video, cards with size for audio and files, all open their URL), spoilers (press reveals), voice messages (waveform pill + duration), reactions (unicode and custom, counts, mine outlined, add from the action bar, toggle by pressing; optimistic, PUT/DELETE .../reactions/{emoji}/@me), stickers (PNG/APNG/GIF pictures; Lottie as a :name: pill), polls (bars, percentages, mine outlined, "N votes • Xh left", vote with PUT /channels/{c}/polls/{m}/answers/@me) and poll results, system rows with icons (types 1-12, 18, 22, 27-31, 55, 65, 67) and "Unsupported message" for any other type, replies to deleted messages ("Original message was deleted"), forwarded messages (snapshot with its pictures and origin), the interaction header ("X used /cmd") with an APP badge, buttons and selects drawn read-only (only a link button opens its URL; no interaction is ever sent), threads listed under their channel and opened (type-21 starter row), forums (post list with tags, counts and the first message), Discord timestamps <t:..:style> (en-US, local time), lists, headings, subtext, masked links with <url> and a title, autolinks <https://..>, </cmd:id>, <id:customize>, @everyone/@here.

Proof: tests/t1/discord.sh second run (DISCORD_DEMO=showcase, #showcase of the fake server, one message of each kind): tests/golden/discord/showcase.out (a line per message: what it carries; the reaction, vote and thread/forum events) and showcase-hash.txt (the golden frame, 1200x4800, TZ=UTC). Frame looked at by eye before recording.

Engine fixes (each with a T0 test on interpreter, AOT and QuickJS):
- React model: narrowing reached neither the elements nor the props of a branch (Z0103/Z0107 on `m.reply !== null ? <Reply m={m.reply} /> : null`): the checker keeps narrowing in the IIFEs the JSX lowering makes; props are evaluated once where the component is written (`_props(Tag, {...})`, typed by the component; a generic component such as FlatList<T> is typed by the call that infers T); a component may return null. The return type of a function returning an element then `c ? x : null` is the union. tests/t0/jsx_react_narrow.sh.
- Strings: charAt over an emoji gave U+FFFD halves on the interpreter and AOT (shared Machine), so joining them did not give the emoji back ("Rolled 4 🎲" in the Markdown scanner): lone halves keep their WTF-8 form (as zrt does) and a pair side by side is rejoined when a string is made or concatenated. tests/t0/str_surrogate_join.sh.

Decisions: embeds of a message with SUPPRESS_EMBEDS are hidden; a lone link whose embeds are all picture-only (gifv/image) is hidden as Discord does; Lottie stickers are a text pill (the lottie plugin is a later step); selects are drawn closed with their placeholder.

Check by hand on the real Discord (secondary account only):
1. A channel with a YouTube link and a Tenor GIF: picture with the play mark; a press opens the browser.
2. React to a message with 👍 and a custom emoji from the action bar, then press the pill again: the web client shows it added then removed (no 429).
3. Vote in a poll, then change the vote; check the count on the web client.
4. A thread and a forum of a real server: listed in the sidebar, opened, posts with their tags.
5. A message with a bot's buttons: drawn, nothing happens when pressed (no interaction sent).
6. A forwarded message, a voice message, a sticker and a reply to a deleted message.

Not proven here: rn_showcase fails (home light/dark hashes da42313c77bfa4b3/19549a9b15a15c96) with develop's binary too, not from this task.

Lines for backlog/later.md:
- ZN-881: Solid model: a component returning null in `_append` (the React model is done).
- ZN-881: a generic function needs its return type written (Z0109 "return type of 'pair'"), unlike TypeScript; infer it.
- ZN-881: Discord: interactive components (buttons, selects) on a secondary account, behind a setting; ban risk to weigh.
- ZN-881: Discord: play video and voice messages inline (zinc:video, audio) instead of opening the link.
- ZN-881: Discord: Lottie stickers through the lottie plugin.
- ZN-881: Discord: archived threads and older forum posts (threads/archived/public, offset paging).
- ZN-881: Discord: role colours on names and mentions.
- ZN-881: Discord: fetch an absent referenced message (shows nothing today).
- ZN-881: Discord: burst (super) reactions and the list of who reacted.
<!-- SECTION:NOTES:END -->
