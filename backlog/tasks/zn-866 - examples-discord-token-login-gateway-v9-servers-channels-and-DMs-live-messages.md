---
id: ZN-866
title: >-
  examples/discord: token login, gateway v9, servers, channels and DMs, live
  messages
status: Done
assignee: []
created_date: '2026-10-30 14:52'
updated_date: '2026-10-30 16:07'
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
- [x] #1 A token logs in and the app shows the user's servers, channels and DMs from READY
- [x] #2 Opening a channel shows its last 50 messages; a message sent from another client appears without reload
- [x] #3 A dropped connection resumes (RESUME) or re-identifies, with backoff
- [x] #4 The token is stored in the system secret store, never in a plain file
- [x] #5 zinc check passes; a T1 session against a local fake gateway (no network) with one golden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-30. tests/t1/discord.sh: fake Discord (examples/discord/tests/fake-discord.ts) on 127.0.0.1; READY 2 servers/2 DMs, history 50 via REST, MESSAGE_CREATE live, drop -> RESUME (session sess-1, seq 2, no second IDENTIFY) -> message after, DM history; frame hash golden; passed 3 runs in a row. Idle login screen: paint p99 0.00 over 300 frames. Token in zinc:secure-store (ZN-876); DISCORD_TOKEN skips it for tests. Engine gaps found and fixed on the way: JSX ternary child with a .map branch, import-free component files in the entry's React model (jsx_list_branch, jsx_project_model), optional unknown = undefined (ZN-877). Choices: identity = Chrome web client on macOS (UA, X-Super-Properties, IDENTIFY properties), capabilities 1246 (no protobuf settings, no token refresh, READY in one payload); no transport compression yet; build number baked (396858), DISCORD_BUILD_NUMBER overrides. Emoji glyphs render as '?' (no colour emoji font): to settle in ZN-868. Not proven against the real Discord (no account used).
<!-- SECTION:NOTES:END -->
