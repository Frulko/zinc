---
id: ZN-903
title: 'examples/discord: pins, replies, threads, read markers and auto scroll'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 23:05'
updated_date: '2026-10-30 23:18'
labels:
  - ui
  - size-M
milestone: m-28
dependencies: []
ordinal: 597460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: complete the conversation: pinned messages (list, jump, pin/unpin when allowed), a reply's reference clickable to jump to the referenced post (fetched once if absent), threads and forum posts opened and read in a side pane, read state (the 'new messages' line at the first unread, ack on read), automatic scroll to bottom when already at the bottom, and a 'new messages' banner with a jump button when scrolled up. Lightweight; settings stay in the official app.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in examples/discord (ZN-903).
- Pins: header pin button opens the pins pane (GET /channels/{id}/messages/pins?limit=50, once per channel, cached; CHANNEL_PINS_UPDATE from someone else drops the cache, mine keeps it). Pin/Unpin under the pointer (PUT/DELETE .../messages/pins/{m}) only when allowed: DMs, server owner, Manage Messages or Pin Messages after @everyone/role/member overwrites (src/permissions.ts; my roles from READY merged_members).
- Replies: Message.replyId; clicking the reply line jumps (in the list: scroll + highlight; absent: GET ?around=&limit=50 once, merged when it reaches the loaded page, else the list is replaced and marked older-than-present until Jump to present).
- Threads and forum posts open in a side pane (SidePane.tsx, replaces the member list; arrow opens as channel to write; acked when read).
- Read state: NEW line above the first message after the read state at open; ack only while the end shows (setAtEnd from onScroll); scrolled up, a bar counts new messages, Jump to present.
- Engine gap fixed: zinc:ui onScroll's nativeEvent now carries React Native's contentSize and layoutMeasurement (lib/std/ui.ts; tests/t0/virtual_rows.sh checks them on the three engines).
- Proof: tests/t1/discord.sh (run 1: NEW line after 902, scrolled-up count, Jump to present acks 965; showcase: pins allowed per channel, pins fetch, pin 1017, reply jump in list, thread pane 306 and forum post 308, #general jump around 100000 fetched once then loaded). Goldens re-recorded after looking at the showcase frame (pins pane at the right).
Not proven by the test: the detached path (a jump that does not reach the loaded page) and the pin permission with channel overwrites; read by hand only.
later.md: - ZN-903: load newer pages when a detached history (after a jump far back) is scrolled to its end, instead of only Jump to present.
later.md: - ZN-903: a composer in the thread pane (today the arrow opens the thread as the channel to write).
later.md: - ZN-903: my roles changed during the session (GUILD_MEMBER_UPDATE for me) do not update the pin permission until the next start.
<!-- SECTION:NOTES:END -->
