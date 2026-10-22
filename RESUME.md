# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## 2026-10-22: Kanban edits the displayed content (ZN-775)

- Owner screenshots of ZN-774.18 identified the real problem: its description is absent, while criteria and implementation notes contain the visible content. The prior focus-only fix was insufficient.
- Modify now uses a scrolling form with prefilled title, description, criteria, plan, notes and result. Empty Markdown fields stay small, long fields have internal scroll limits. Focus starts in the first populated section. Criteria support editing, check/uncheck, addition and removal. Numeric row keys keep text fields/caret alive while draft objects change.
- A deep copy separates all draft sections/criteria from source data and survives close/reopen. Save writes only changed fields through Backlog.md. Incremental remove/add/check operations update criterion text and checked states in one CLI write. Stale comparison covers every editable section; empty titles/criteria are rejected. Comments and metadata are preserved. Description clearing retains its guarded atomic replacement; plan/notes/result clearing uses CLI support.
- Proof: `build/zinc check examples/kanban`, `tests/run --only kanban_logic` and `tests/run --only kanban` passed. The UI regression starts with no description and populated criteria/notes/plan/result, checks actual prefilled fields, focus and continued typing, edits/checks/adds/removes criteria, restores the full draft and verifies all sections through CLI rereads. Persistence checks cover empty sections/criteria, stale notes/criteria, comments and assignees. Only editor golden frame 225 changes; reviewed visually. T1 idle, drag/scroll and native/QuickJS smokes pass.
- Exact screenshot task ZN-774.18 captured from a read-only snapshot without changing its source: `/tmp/kanban-774-18-proof/editor-10.png` (criteria), `editor-20.png` (notes). Run `ZINC_BACKGROUND=1 build/zinc run examples/kanban`; restart an older instance. No engine changes, new dependencies, cross-target/device or screen-reader checks, and nothing pushed. Usage: n/a for Codex.

## Earlier known limits (unrelated, not re-investigated)

- Prior resume recorded diagnostics, netlog and Windows pixel test failures, plus an agent_ota CI flake. Verify these in their own tasks, not while changing a demo.
- Mobile follow-ups remain in their tasks and `backlog/later.md`: ZN-744/741 rendering on Nexus 7, ZN-627 Android GLES 3, ZN-746 software rendering, ZN-743 hero; ZN-631 real Nexus 7 QR scan is in Review. Do not disturb the owner's music app on the tablet. Paid store/device publishing remains the owner's step.

## Next

`tools/next-task`: ZN-568 — Web environment module for QuickJS contexts (DOM/BOM, events, rAF, fetch/XHR, storage). The current owner request is complete; no unrelated backlog task started.
