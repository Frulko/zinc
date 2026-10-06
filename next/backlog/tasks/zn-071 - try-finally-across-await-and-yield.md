---
id: ZN-071
title: try/finally across await and yield
status: Backlog
assignee: []
created_date: '2026-10-06 22:50'
labels:
  - language
  - async
  - size-M
milestone: m-13
dependencies:
  - ZN-070
ordinal: 40130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lower `finally` in async functions and generators with a continuation in the state machine (the prototype rejects it, so only the conformance corpus of the new engine can define the expected output: use Node's behaviour). Includes `return` inside try with finally and rejection paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures compare with Node on: finally after await, return in try, throw in finally, nested try, break/continue through finally in loops
- [ ] #2 audit 01 try_finally_async rows pass
<!-- AC:END -->
