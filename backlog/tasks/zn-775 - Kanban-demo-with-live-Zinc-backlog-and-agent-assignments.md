---
id: ZN-775
title: Kanban demo with live Zinc backlog and agent assignments
status: Done
assignee:
  - '@codex-kanban'
created_date: '2026-10-22 18:34'
updated_date: '2026-10-22 20:16'
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
- [x] #5 Deep scrolling keeps virtual cards visible; drag preview preserves the pointer grip and shows the insertion position
- [x] #6 Compact desktop UI and full-height Markdown task detail support persisted edits and comments through Backlog.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented examples/kanban as a native zinc:ui/Solid demo, reusing virtual lists, zinc:ui/dnd, kit dialogs, icons and zinc:process. The app consumes the existing Backlog.md versioned JSON watch stream; details use task view --json. No new dependency, engine change, server or network call.

Verified: build/zinc check examples/kanban; tests/run --changed -> PASS affected_paths, ci_plan, kanban, kanban_logic (4 passed). The scripted offline session covers pointer and touch cross-column moves, reordering, keyboard movement, modal actions/dismissal, assignee search, milestone filter and reset; feature PNGs reviewed. Interpreter, AOT and QuickJS first-board hash: e9f2d59eb4057bfa. Idle 300-frame paint p50/p99: 0.00/0.00 ms (docs/reports/zinc-next-perf.md). Separate integration test receives an initial real CLI snapshot, reads detail, changes a named assignment in a temporary backlog and receives the changed snapshot. Actual AOT capture loads all 975 local tasks. No watcher child remained after exit.

Scope choice: drag changes are session-local and explicitly labelled; no task file is edited by the demo. Source status/assignee changes override local moves. Declared agent work in progress and modal assignment state use source data, never local moves. Existing @parallel reservations cannot identify which AI: named assignees are shown exactly, generic and missing identities are explicit. No process heartbeat or cross-worktree aggregation is inferred. Future coordinator heartbeats/worktree aggregation are one line in backlog/later.md; README documents named claims with the existing CLI.

Not checked: other targets, physical touch devices, screen-reader behavior, or comparative performance. UI follows examples/GUIDELINES.md for desktop; no new UI model. README and changelog updated. Golden fixture uses real task descriptions and criteria with fixed test statuses and one explicitly artificial named assignee.

usage: n/a for this Codex session (tools/usage selects an unrelated Claude transcript).

Owner follow-up: fix imprecise drag preview and disappearing virtual rows, use the existing Markdown renderer, compact the app chrome/detail, add editing and comments. Reopened for implementation and regression proofs.

Owner follow-up completed: compact desktop toolbar and cards, a nearly full-height task window with a metadata sidebar and pinned comment composer. The same selectable Markdown parser/renderer now lives in lib/std/markdown* and is reexported by Agents; Kanban uses it for description, criteria, plan, notes, summary and comments. No engine changes, new dependencies or general kit import overhead.

Root causes: the JSX card component returned a fragment, so virtual absolute geometry was flattened away. A real View row fixes every column. tests/data/kanban/geometry.tsx fails without it on row 40 and passes with the fix, including row 199/back to 0, bounded mounted rows and exact original mouse grip. The drag ghost uses the full card, the initial pointer offset, a surface layer and an insertion marker.

Edit/comment actions persist title and description or append a named Markdown comment. Drafts survive closing/reopening and source refresh; failed/stale saves retain them. Tests cover real UI fields/buttons and rendering, CLI round trips, named comments, literal shell-like text, validation, rejected stale edits, retained assignees, and an empty description. Backlog.md ignores empty --description: that case clears only the marked body by atomic file replacement, retaining other fields and mode; the normal CLI remains responsible for metadata/comments. Offline snapshots stay read-only. Drag/status moves still preview locally.

Validation: tests/run --only kanban, kanban_logic, markdown, affected_paths and ci_plan all pass; zinc check passes for Kanban and Agents. Kanban T1 includes mouse/touch/keyboard, deep-scroll geometry, Markdown detail/editor feature goldens, 300 idle frames, and matching interpreter/AOT/QuickJS first-board hashes (763dad18a1e3cfed). Feature captures reviewed. Full real backlog snapshot (975 tasks) captured. Figures logged in zinc-next-perf.md. No full Agents conversation suite, cross-target/device or screen-reader run; public behavior of its promoted Markdown implementation is unchanged. Concurrent edits within the final CLI call follow Backlog.md last-writer semantics (no atomic compare-and-swap); the preflight rejects already-stale drafts.

usage: n/a for Codex. Unrelated examples/fatty and tests/data/fatty left untouched.

Owner follow-up: entering edit mode must show the existing Markdown content and put keyboard focus directly in its editor. Add a UI regression that inspects the field before the test helper types.

Editor focus correction complete. The previous UI test masked the defect by focusing each field itself; a regression with nonempty Markdown first failed on the old focused field, then passed after deferring editor focus until its conditional mount and opening pointer press complete. Actual fields retain title/body, direct typing works without clicking, reopening retains draft and focus. zinc check examples/kanban, tests/run --only kanban_logic and tests/run --only kanban pass. Only golden frame 225 changes (focused border/caret), reviewed visually; all other scripted frame hashes match. No engine or persistence behavior changed. Editing remains title/description only; other detail sections remain read-only. No cross-target/device or screen-reader check. Unrelated fatty files untouched; usage n/a for Codex.

Owner screenshots show the actual edit defect on ZN-774.18: no description, but criteria and notes exist. Prior focus-only correction did not fulfill editing the visible content. Reopen to offer all displayed task content as prefilled editable sections and test the no-description case through persisted UI changes.

Actual screenshot defect corrected: Modify now preloads title, description, criteria, plan, notes and result into a scrolling form. Empty descriptions occupy a small field and focus starts in the first populated section. Criteria text/check states/add/remove are editable. Full deep-copied drafts survive close/reopen without changing source. Save updates only changed fields and uses incremental remove/add/check in one CLI write for criteria; stale protection covers all editable sections, and empty titles/criteria are rejected. Clearing plan/notes/result is verified through CLI; the guarded empty-description path still works alongside other changed sections. Regression starts with an absent description and populated criteria/notes, tests actual field contents/focus/continued typing, edits/checks/adds/removes criteria, restores all draft sections and verifies saved fields/comments. Tests kanban_logic and kanban plus zinc check examples/kanban pass. Only golden frame 225 changes; captures reviewed. Read-only copy of actual ZN-774.18 visually checked at /tmp/kanban-774-18-proof/editor-10.png and editor-20.png; its source was never edited. No engine/dependency changes, cross-target/device or screen-reader checks, nothing pushed; usage n/a for Codex.
<!-- SECTION:NOTES:END -->
