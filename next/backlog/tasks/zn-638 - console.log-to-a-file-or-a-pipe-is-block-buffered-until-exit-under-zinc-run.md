---
id: ZN-638
title: console.log to a file or a pipe is block buffered until exit under zinc run
status: Backlog
assignee: []
created_date: '2026-10-10 15:00'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50260
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-613: 'zinc run app > log &' shows nothing while the app runs, because stdout is fully buffered when it is not a terminal (Node writes files synchronously and pipes per write). system_instance waited its full bound for a console.log line for that reason and now reads stderr. Flush stdout per line when it is not a terminal, or at each event-loop turn; measure the cost on a console.log loop (the jsonout kernel). Then look for other tests that poll a log for a console.log line and wait out their bound.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a console.log line of a running program is in the redirected file or pipe within one event-loop turn, in the interpreter, AOT and QuickJS, with a test
- [ ] #2 console.log loop throughput to a file measured before and after, in docs/reports/zinc-next-perf.md
- [ ] #3 tests that polled a log for a console.log line are listed and no longer wait their full bound
<!-- AC:END -->
