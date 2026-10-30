---
id: ZN-910
title: 'examples/discord: the account safety rules and their Settings page'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 23:52'
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
- [ ] #1 The 12 rules of the report's list are in src/safety, each with its policy entry and a check in the safety test
- [ ] #2 Settings has an 'Account safety' page with the report's text and the live state (safe mode, today's counts, account age and verification)
<!-- AC:END -->
