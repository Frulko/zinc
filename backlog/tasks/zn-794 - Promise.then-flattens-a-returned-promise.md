---
id: ZN-794
title: Promise.then flattens a returned promise
status: Backlog
assignee: []
created_date: '2026-10-24 23:54'
labels:
  - size-S
milestone: m-13
dependencies: []
ordinal: 2900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-155: `p.then(x => promise)` does not flatten the promise it returns, so `fetch(u).then(r => r.text())` yields a Promise (async/await is right): the checker's __then helpers need a Promise-returning variant. The parity gate's most visible PARTIAL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `fetch(u).then(r => r.text())` has type Promise<string> and yields the text on interpreter, AOT and QuickJS
- [ ] #2 a T0 test covers then, catch and finally returning a promise
<!-- AC:END -->
