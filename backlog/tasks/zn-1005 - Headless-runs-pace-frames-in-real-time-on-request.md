---
id: ZN-1005
title: 'Headless runs: pace frames in real time on request'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:33'
labels:
  - headless
  - tools
  - size-S
milestone: m-10
dependencies: []
ordinal: 5900
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A headless run without ZINC_DETERMINISTIC runs tens of thousands of frames a second, so a program waiting on threads, timers or the network ends before results arrive, and `ZINC_FRAMES` is no duration (ZINC_REALTIME does not pace). Make `ZINC_REALTIME=1` pace to the display rate (and let `ZINC_DURATION=ms` end the run) so screenshot and agent tooling is predictable.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-862: a headless run without `ZINC_DETERMINISTIC` runs its frames faster than real time, so a program waiting on threads or timers can end before their results arrive.
- music (2026-10-15): headless runs (ZINC_HEADLESS) run tens of thousands of frames a second, so a program waiting on the network needs ZINC_FRAMES of 200000 for a few seconds of wall time; a ZINC_REALTIME that paces headless frames would make scripted captures of networked programs simple.
- Headless runs: ZINC_REALTIME does not pace frames, so ZINC_FRAMES is not a duration for screenshot tooling.
- Headless runs with ZINC_SHOT: unless shots are taken often, frames run unthrottled, so `ZINC_FRAMES=300` ends before a 500 ms `setTimeout` fires; scripted inspector shots needed `ZINC_FRAMES=30000`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=60` takes about one second
- [ ] #2 a `setTimeout(500)` fires before a 300-frame ZINC_SHOT run ends
- [ ] #3 deterministic runs unchanged; docs/AGENTS env list updated
<!-- AC:END -->
