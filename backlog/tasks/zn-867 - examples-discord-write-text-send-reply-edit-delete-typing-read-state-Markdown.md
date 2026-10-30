---
id: ZN-867
title: >-
  examples/discord: write text: send, reply, edit, delete, typing, read state,
  Markdown
status: Backlog
assignee: []
created_date: '2026-10-30 14:52'
labels:
  - net
  - ui
  - size-M
milestone: m-28
dependencies:
  - ZN-866
ordinal: 114
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 1 of the research report: REST send/reply/edit/delete, typing indicator, ack and unread markers, Discord Markdown (md4c plus mentions, emoji, spoilers), per-route rate-limit buckets from the response headers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Send, reply, edit and delete work and the other clients see them
- [ ] #2 Typing indicators show both ways; unread and mention counts follow MESSAGE_ACK
- [ ] #3 Rate-limit headers are honoured: a 429 waits retry_after, no request is sent while a bucket is empty
- [ ] #4 The fake-gateway T1 session covers send and edit
<!-- AC:END -->
