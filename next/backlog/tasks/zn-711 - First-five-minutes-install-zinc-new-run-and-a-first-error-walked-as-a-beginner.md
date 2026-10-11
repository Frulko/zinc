---
id: ZN-711
title: >-
  First five minutes: install, zinc new, run and a first error, walked as a
  beginner
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 11:38'
labels:
  - cli
  - docs
  - size-M
milestone: m-13
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-11): Zinc is for education, makers, artists and DIY, and nobody outside the project has walked its first run. Walk it as a newcomer on the development Mac: install, `zinc doctor`, `zinc new` with each template, `zinc run`, a first change, a first mistake, `zinc dev`. Fix on the way what takes less than an hour; the rest is lines for `next/backlog/later.md`.

Second lane of the parallel agents, after the pinball and the museum (owner's order, `next/backlog/priority.json`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a scripted test creates a project from every template of templates/ in an empty directory, runs it headless for a few frames and passes; a template that fails is fixed
- [ ] #2 six beginner mistakes (a misspelt import, a type error, an unknown zinc: module, a plugin that is not installed, a JSX tag left open, a missing file) each print the file, the line and what to do next; the messages are goldens
- [ ] #3 docs/guide/01-getting-started.md follows the tested path command for command, from the install to a changed line seen on screen, and says what a teacher, a maker and an artist can open next
- [ ] #4 what the walk found and did not fix is given as lines for next/backlog/later.md
<!-- AC:END -->
