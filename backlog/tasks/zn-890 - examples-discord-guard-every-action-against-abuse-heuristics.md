---
id: ZN-890
title: 'examples/discord: guard every action against abuse heuristics'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 22:10'
updated_date: '2026-10-30 23:11'
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
- [x] #1 An audit of every user action and network path in docs/reports/discord-client-requests.md, each with its guard
- [x] #2 Session hygiene: resume across quick restarts, a single instance per account, the identify budget kept across launches
- [x] #3 Action guards: slowmode and permissions checked before sending (no request that would be refused), human pacing on sends, reactions, DMs and friend requests, no bulk actions
- [x] #4 The fake Discord answers 401, captcha, long 429 and op 9 so a session proves safe mode and the backoff
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
One safety model in one place: examples/discord/src/safety/ (index.ts the guard, the only entry point; policy.ts every number; core.ts budgets, cooldowns, spam, Discord's buckets; access.ts permissions). rest.ts and gateway.ts are transports reachable only through the guard; services/limits.ts (ZN-886) moved in and deleted. Six layers, numbers and proving tests: docs/reports/discord-safety-model.md; the audit of every request with its guard kind: docs/reports/discord-client-requests.md.

Proof: tests/t1/discord_safety.sh (14 s; FAKE_GUARDS=1: a launch, a second launch that RESUMEs sess-1 without IDENTIFY, a third refused as already running, then DISCORD_DEMO=safety: read-only channel, blocked DM, slowmode with countdown, repeat and paste refused, six mentions refused, 15 of 20 reactions then a 5 s cooldown, 1 of 15 history pages, captcha -> safe mode, 60 s 429 -> breaker, op 9 re-identify after 1-5 s with the day's count, 401 -> login and nothing more); examples/discord/tests/rate-limits.ts (discord_ratelimit: human pace passes, timer and background window refused, burst cooldown 5 s then 10 s, read loop slowed, spam rules, 64-bit permissions). discord, discord_voice, discord_notify pass.

Single instance: per app (zinc:system/instance), so also per account; the second launch focuses the first. Identify budget: 50 a day across launches in zinc:storage.

Engine gaps fixed on the way, each with a run golden, on the interpreter, AOT and QuickJS: return await inside try...finally of an async function skipped the finally blocks (desugar.cpp; try_finally_async.ts); an any[] taken out of any was a copy (dyn.cpp; dyn_array_alias.ts); undefined passed from a file without Dyn values into any became null (check.cpp; undefined_into_any.ts). promise_statics.ts of the run goldens fails on develop's binary too (Z0103 on NeverPromise), not from here.

Also: logout and a 401 forget the keychain token only when DISCORD_TOKEN is unset (a test never touches the keychain); discord.sh and discord_voice.sh get their own ZINC_SYSTEM_RUNTIME_DIR for the instance lock.
<!-- SECTION:NOTES:END -->
