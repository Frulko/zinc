---
id: ZN-886
title: 'examples/discord: behave like the official client to avoid account bans'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 21:05'
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
- [ ] #3 Anything risky the app does today is removed or put behind the same behaviour as the official client
<!-- AC:END -->
