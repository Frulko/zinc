---
id: ZN-006
title: Diagnostics registry
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 15:34'
labels:
  - size-S
milestone: m-1
dependencies:
  - ZN-005
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want every error to have a code, a title, a reason, a fix and an example, so that I can run `zinc explain Z1006`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 registry file drives messages and docs; one fixture per code; `zinc explain` prints the entry.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
include/zn/diagnostics.h is the registry (X-macro: name, code, title, why, fix, example); generates kZ* constants, messages, 'zinc explain <code>|--codes|--markdown' and next/docs/diagnostics.md. Parser codes renumbered Z0001-Z0005 (unsupported is now Z0005). T0 diagnostics: every code has a fixture, every registry example triggers its own code, docs are current, unknown code rejected (each verified by breaking it). Not done (ponytail): code frames in output, add when the checker emits multi-line context. usage: 28000 in / 265691 cached / 2479 out tokens, 5 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
