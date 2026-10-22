# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## 2026-10-22: owner-requested Kanban demo (ZN-775)

- Done: `examples/kanban`, a native board over all local backlog tasks. Five status columns, virtual cards, mouse/touch drag and reorder, keyboard moves, search, milestone/assignment filters, detail modal, activity journal and live Backlog.md JSON watcher. Run: `ZINC_BACKGROUND=1 build/zinc run examples/kanban`.
- Moves stay local to the session and are visibly labelled; source task files are never edited. Source status/assignment changes win. Declared work in progress uses source data; local moves never invent an agent claim. Named assignees appear unchanged; existing `@parallel` claims have no reliable identity. README explains named claims, another checkout and offline snapshots. Future heartbeat/worktree aggregation: `backlog/later.md`.
- Proof: `tests/run --changed` passed `kanban`, `kanban_logic`, `ci_plan`, `affected_paths`. Types pass; feature screenshots reviewed; scripted mouse/touch/keyboard session; real CLI watcher/assignment/detail test in a temporary backlog; same first-board hash on interpreter/AOT/QuickJS; idle paint p50/p99 0.00 ms over 300 frames. Actual AOT capture loaded all 975 tasks. Performance smoke recorded in `docs/reports/zinc-next-perf.md`.
- No engine rebuild or cross-target run. Physical touch devices, screen readers and actual agent-process liveness were not verified. No process left running; no push/publication.
- Usage: n/a (tools/usage selects a Claude transcript unrelated to this Codex session).

## Earlier known limits (unrelated, not re-investigated)

- Prior resume recorded diagnostics, netlog and Windows pixel test failures, plus an agent_ota CI flake. Verify these in their own tasks, not while changing a demo.
- Mobile follow-ups remain in their tasks and `backlog/later.md`: ZN-744/741 rendering on Nexus 7, ZN-627 Android GLES 3, ZN-746 software rendering, ZN-743 hero; ZN-631 real Nexus 7 QR scan is in Review. Do not disturb the owner's music app on the tablet. Paid store/device publishing remains the owner's step.

## Next

`tools/next-task`: ZN-361.01 — Paint rotate, skew and uneven scales of the RN transform array. The current owner request is complete; no unrelated backlog task started.
