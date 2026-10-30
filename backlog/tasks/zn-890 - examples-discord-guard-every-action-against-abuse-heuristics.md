---
id: ZN-890
title: 'examples/discord: guard every action against abuse heuristics'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:10'
labels:
  - net
  - size-L
milestone: m-28
dependencies:
  - ZN-886
ordinal: 584460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants every possible mechanism, across the whole app, that keeps a legitimate user of this light client from tripping Discord's abuse heuristics, without imitating the official client's identity (decided: no super-properties, user-agent or fingerprint changes). ZN-886 added rate limits, safe mode and gateway pacing; this task audits every code path and action and adds the rest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An audit of every user action and network path in docs/reports/discord-client-requests.md, each with its guard
- [ ] #2 Session hygiene: resume across quick restarts, a single instance per account, the identify budget kept across launches
- [ ] #3 Action guards: slowmode and permissions checked before sending (no request that would be refused), human pacing on sends, reactions, DMs and friend requests, no bulk actions
- [ ] #4 The fake Discord answers 401, captcha, long 429 and op 9 so a session proves safe mode and the backoff
<!-- AC:END -->
