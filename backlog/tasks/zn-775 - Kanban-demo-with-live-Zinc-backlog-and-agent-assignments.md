---
id: ZN-775
title: Kanban demo with live Zinc backlog and agent assignments
status: Done
assignee:
  - '@codex-kanban'
created_date: '2026-10-22 18:34'
updated_date: '2026-10-22 18:54'
labels:
  - ui
  - demo
  - size-M
dependencies: []
ordinal: 511460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: build an interactive Trello-style project board using the real Zinc backlog, with columns, draggable cards, task detail modal and a way to watch agent claims.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Native demo loads all project tasks with searchable columns and detailed modal
- [x] #2 Cards move between columns and reorder with pointer and keyboard without modifying source tasks
- [x] #3 Live backlog updates show actual assignees and distinguish reservations from running agents
- [x] #4 Quality guideline checks, offline scripted session and idle proof pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented examples/kanban as a native zinc:ui/Solid demo, reusing virtual lists, zinc:ui/dnd, kit dialogs, icons and zinc:process. The app consumes the existing Backlog.md versioned JSON watch stream; details use task view --json. No new dependency, engine change, server or network call.

Verified: build/zinc check examples/kanban; tests/run --changed -> PASS affected_paths, ci_plan, kanban, kanban_logic (4 passed). The scripted offline session covers pointer and touch cross-column moves, reordering, keyboard movement, modal actions/dismissal, assignee search, milestone filter and reset; feature PNGs reviewed. Interpreter, AOT and QuickJS first-board hash: e9f2d59eb4057bfa. Idle 300-frame paint p50/p99: 0.00/0.00 ms (docs/reports/zinc-next-perf.md). Separate integration test receives an initial real CLI snapshot, reads detail, changes a named assignment in a temporary backlog and receives the changed snapshot. Actual AOT capture loads all 975 local tasks. No watcher child remained after exit.

Scope choice: drag changes are session-local and explicitly labelled; no task file is edited by the demo. Source status/assignee changes override local moves. Declared agent work in progress and modal assignment state use source data, never local moves. Existing @parallel reservations cannot identify which AI: named assignees are shown exactly, generic and missing identities are explicit. No process heartbeat or cross-worktree aggregation is inferred. Future coordinator heartbeats/worktree aggregation are one line in backlog/later.md; README documents named claims with the existing CLI.

Not checked: other targets, physical touch devices, screen-reader behavior, or comparative performance. UI follows examples/GUIDELINES.md for desktop; no new UI model. README and changelog updated. Golden fixture uses real task descriptions and criteria with fixed test statuses and one explicitly artificial named assignee.

usage: n/a for this Codex session (tools/usage selects an unrelated Claude transcript).
<!-- SECTION:NOTES:END -->
