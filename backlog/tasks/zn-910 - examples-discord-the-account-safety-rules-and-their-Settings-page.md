---
id: ZN-910
title: 'examples/discord: the account safety rules and their Settings page'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 23:52'
updated_date: '2026-10-31 00:28'
labels:
  - net
  - ui
  - size-M
milestone: m-28
dependencies:
  - ZN-890
ordinal: 604460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: every rule a well-behaved client should follow, from docs/reports/discord-account-safety-rules.md (32 rules, 12 to add to the safety module), put in examples/discord/src/safety (policy table only, one place) and explained to the user in a Settings page 'Account safety' (what the app does for you, what you should do, your account now), using the report's text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The 12 rules of the report's list are in src/safety, each with its policy entry and a check in the safety test
- [x] #2 Settings has an 'Account safety' page with the report's text and the live state (safe mode, today's counts, account age and verification)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. The 12 rules of docs/reports/discord-account-safety-rules.md are in examples/discord/src/safety (numbers in policy.ts only): 40003 (safe mode, no new DM 1 h), a /day column per kind (send 1500, react 1000, edit 300, delete 200, dm 20, friend 5, older 1500, join/leave/profile-edit 5) and GLOBAL_PER_DAY 6000 kept across launches (zinc:storage 'day'), young (<7 days from the snowflake) or unverified accounts at half write caps and no new DM, new DMs only to friends or people sharing a server plus the cold-DM pause (>5 cold DMs in 10 min: 10 min), invites (1 a message, same invite in 2 conversations / 10 min, none in a first DM to a stranger), @everyone/@here/roles counted and MENTION_EVERYONE required, reconnect storm (>20/h: 5 min hold), third safe mode in a day lasts 24 h (kept across launches), new member (<10 min: no links or mentions; High verification holds 10 min, Medium 5 min account age), reaction toggles (4 a minute), failed logins (3/h stop the password login 1 h, in memory), join/leave/profile-edit rows. Checks: tests/rate-limits.ts (discord_ratelimit) and discord_safety (@everyone, invites, toggles, 40003, the third safe mode, Settings' account lines). Settings: an Account safety tab (components/AccountSafety.tsx) with the report's text and guard.safetyState(). Engine gap fixed: a for...of over 'c ? any : [x]' failed with Cannot find name '__dynToN' (the Dyn path re-checked a clone of the iterable in the program's scope); check.cpp now finds generated names in the generated scope; test t0/forof_dyn_conditional. Goldens: discord-safety session and server (new lines; the burst now 11 of 20 after 4 toggles), discord hash (the Settings frame shows the third tab).
<!-- SECTION:NOTES:END -->
