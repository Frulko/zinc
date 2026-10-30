---
id: ZN-867
title: >-
  examples/discord: write text: send, reply, edit, delete, typing, read state,
  Markdown
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 14:52'
updated_date: '2026-10-30 16:45'
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
- [x] #1 Send, reply, edit and delete work and the other clients see them
- [x] #2 Typing indicators show both ways; unread and mention counts follow MESSAGE_ACK
- [x] #3 Rate-limit headers are honoured: a 429 waits retry_after, no request is sent while a bucket is empty
- [x] #4 The fake-gateway T1 session covers send and edit
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-30. tests/t1/discord.sh (one T1 session, fake Discord on 127.0.0.1, ZINC_DETERMINISTIC=0 since the waits and nonces need the real clock): READY read states (#general read to 902 of 903, #welcome 2 mentions); opening #general acks 903 (body token:null, last_viewed), the fake answers MESSAGE_ACK of #welcome from another device -> 0 mentions; live messages in the open channel acked once each (904, 905, 908), never twice; typing POST -> TYPING_START back -> 'Grace is typing…', cleared by her message; send with a snowflake nonce, echo MESSAGE_CREATE with the nonce replaces the pending message (shown once); reply with message_reference 903 waited for the bucket the first send emptied (X-RateLimit-Remaining 0, Reset-After 0.5: server waited=true); edit refused once with 429 retry_after 0.3, retried after it (waited=true) and echoed MESSAGE_UPDATE; delete echoed MESSAGE_DELETE; Markdown parse checked on a sample and the last frame hash. Passed 3 runs in a row. Idle login screen: paint p99 0.00 over 300 frames; QuickJS runs the app. Not proven against the real Discord (no account used). Choices: Discord's Markdown parsed by the app's own src/markdown.ts (lib/std/markdown treats __ as bold and has no spoiler/strike/mention; md4c has indented code, setext headings and soft breaks Discord lacks); hidden spoilers as bullets (a dark box needs a run background); typing re-sent every 8 s while typing, never while editing; ack 300 ms after messages in the open channel, one per burst; rate-limit buckets per X-RateLimit-Bucket and major id, a request reserves one from its bucket, 429 global pauses all, three retries at most; mentions counted for DMs, @everyone and user mentions (roles wait for the member list, ZN-868). Engine gaps fixed on the way, own commits: ui.RUN_STRIKE (tests/t0/ui_run_strike.sh), negative offsets -top-2/-right-[6px] in the runtime and the JSX check (ui_tokens golden), any | undefined lowered as any so Map<string, any> builds (tests/t0/map_any_value.sh).
<!-- SECTION:NOTES:END -->
