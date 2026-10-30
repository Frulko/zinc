---
id: ZN-866
title: >-
  examples/discord: token login, gateway v9, servers, channels and DMs, live
  messages
status: In Progress
assignee: []
created_date: '2026-10-30 14:52'
updated_date: '2026-10-30 14:58'
labels:
  - net
  - ui
  - size-M
milestone: m-28
dependencies:
  - ZN-865
ordinal: 104
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 0 of docs/reports/discord-client-research.md: a native Discord client in the spirit of discord-lite (no webview, low memory). zinc:ui per examples/GUIDELINES.md. Token pasted once and kept in the system secret store; gateway v9 JSON (HELLO, heartbeat, IDENTIFY with one coherent client identity shared with X-Super-Properties, READY, RESUME, reconnect); guild, channel and DM lists; the open channel's history over REST and new messages from MESSAGE_CREATE. Unofficial: the README says so and says to test with a spare account.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A token logs in and the app shows the user's servers, channels and DMs from READY
- [ ] #2 Opening a channel shows its last 50 messages; a message sent from another client appears without reload
- [ ] #3 A dropped connection resumes (RESUME) or re-identifies, with backoff
- [ ] #4 The token is stored in the system secret store, never in a plain file
- [ ] #5 zinc check passes; a T1 session against a local fake gateway (no network) with one golden
<!-- AC:END -->
