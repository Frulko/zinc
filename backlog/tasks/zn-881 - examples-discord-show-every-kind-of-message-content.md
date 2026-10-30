---
id: ZN-881
title: 'examples/discord: show every kind of message content'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 19:10'
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
- [ ] #1 Embeds: link previews, rich embeds (title, description, fields, colour bar, thumbnail, image, footer, author) and video/GIF embeds (Tenor, YouTube: their picture and a link)
- [ ] #2 Reactions (unicode and custom emoji, counts, mine highlighted, add and remove), stickers, polls (read and vote)
- [ ] #3 System messages (joins, pins, boosts, thread created, calls), replies to deleted messages, forwarded messages, threads and forum posts listed and opened
- [ ] #4 Attachments that are not pictures: video and audio with a player or a link, files with size; Discord timestamps <t:...> and the remaining Markdown (lists, masked links, headings) drawn
- [ ] #5 A T1 session over the fake server shows one message of each kind; one golden frame
<!-- AC:END -->
