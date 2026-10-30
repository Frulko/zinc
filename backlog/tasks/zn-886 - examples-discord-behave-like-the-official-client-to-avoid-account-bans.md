---
id: ZN-886
title: 'examples/discord: behave like the official client to avoid account bans'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-30 21:05'
updated_date: '2026-10-30 21:23'
labels:
  - net
  - size-M
milestone: m-28
dependencies: []
ordinal: 580460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked to analyse and put in place everything that keeps an account using this client from being flagged: what the official desktop client sends (gateway IDENTIFY properties and capabilities, X-Super-Properties, User-Agent, client build number, locale/timezone headers, cookies and fingerprint from /experiments), request pacing and 429/retry_after handling, global rate limits, no endpoints the official client does not call, no automated actions, captcha handling, how known third-party clients (Discord Lite, Ripcord, Abaddon, Vencord-based tools) stay unflagged. Research report in docs/reports/, then implement in the app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A report in docs/reports/ of the ban risks and what the official client sends, with sources
- [ ] #2 The app sends the same identity as the official desktop client and paces requests, honouring 429 and the global limit
- [x] #3 Anything risky the app does today is removed or put behind the same behaviour as the official client
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Narrowed scope (coordinator, 2026-10-30): make the client a well-behaved API citizen; out of scope: changing the identity to imitate the official client (super-properties, build number, user-agent, cookies, fingerprints) or anything aimed at avoiding detection. Identity code (services/identity.ts, constants.ts) untouched.

Done: services/limits.ts (sliding windows, plain errors, safe-mode rule); rest.ts: global 50/s, invalid-request cap (100 refusals of 401/403/429 in 10 min, shared 429 not counted), 429 retried only for waits <= 10 s and 3 times, safe mode (401, 403 40002/50178, captcha, 429 not retried: background requests typing/ack/refresh-urls stop 10 min, message shown; 401 stops everything and returns to login), captchas never solved. gateway.ts: 110 non-heartbeat sends a minute with an ordered queue, op 9 d:false waits 1-5 s doubled in a row, backoff with jitter, 4007/4009 drop the session, IDENTIFY spaced 5 s and capped 50/day per process, start() closes an open connection (one session per token). state.ts: op 37 not re-sent for the channel already subscribed (reset on READY/RESUMED). cdn.ts: refresh-urls batched per frame, 50 URLs a request. main.tsx: DISCORD_DEMO/DISCORD_BENCH run only with DISCORD_API on 127.0.0.1/localhost. Audit: docs/reports/discord-client-requests.md (startup makes no REST call; history only on open; no op 8; all writes are user actions).
Tests: tests/run --only discord, discord_voice, discord_ratelimit (new T0, examples/discord/tests/rate-limits.ts) pass on the main tree's binary.
AC #1/#2: the identity half (what the official client sends, imitating it) is outside the narrowed scope; pacing and 429/global are done. Left for the owner to decide whether the identity half stays in this task.
<!-- SECTION:NOTES:END -->
