# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## 2026-10-22: Kanban follow-up completed (ZN-775)

- Owner corrections done: compact desktop chrome/cards, precise full-card drag with the original pointer grip and insertion marker, and virtual rows that remain visible when scrolling deeply. The card component needed a real View row host: its fragment lost virtual positioning. A regression fails on row 40 without the correction and checks middle/bottom/back, fewer than 20 mounted rows for 200 tasks and exact pointer grip.
- Detail window now uses almost the full height, with a scrolling selectable Markdown document, metadata sidebar and pinned comment composer. Parser/renderer promoted from Agents to `lib/std/markdown*`; Agents reexports it, with its existing colors and copy behavior. The general kit import path is unchanged.
- Explicit Save/Comment writes title/description/comments to Backlog.md, retains drafts on close/error/watch refresh and rejects already-stale title/description edits. Empty descriptions are cleared through existing section markers and atomic replacement because the CLI ignores an empty --description. Other fields and file mode stay intact. Drag/status moves remain local; offline snapshots are read-only. CLI last-writer semantics still apply to races during the final command.
- Proof: `tests/run --only kanban`, `kanban_logic`, `markdown`, `affected_paths`, `ci_plan` passed; types passed for Kanban and Agents. The demo test exercises actual UI fields/buttons plus real CLI persistence in a temporary backlog. Feature PNGs reviewed. Interpreter/AOT/QuickJS first-board hash matches (`763dad18a1e3cfed`); idle paint p50/p99 0.00 ms over 300 frames. Perf log and README updated; full real backlog snapshot captured.
- Run: `ZINC_BACKGROUND=1 build/zinc run examples/kanban`. Restart an already running instance to load the changes. No engine rebuild, cross-target/device or screen-reader run, and no full Agents conversation suite. No process started by this session remains; the user's already-running Kanban instance was left alone. Nothing pushed.
- Unrelated `examples/fatty/` and `tests/data/fatty/` were left untouched. Usage: n/a for this Codex session.

## Earlier known limits (unrelated, not re-investigated)

- Prior resume recorded diagnostics, netlog and Windows pixel test failures, plus an agent_ota CI flake. Verify these in their own tasks, not while changing a demo.
- Mobile follow-ups remain in their tasks and `backlog/later.md`: ZN-744/741 rendering on Nexus 7, ZN-627 Android GLES 3, ZN-746 software rendering, ZN-743 hero; ZN-631 real Nexus 7 QR scan is in Review. Do not disturb the owner's music app on the tablet. Paid store/device publishing remains the owner's step.

## Next

`tools/next-task`: ZN-568 — Web environment module for QuickJS contexts (DOM/BOM, events, rAF, fetch/XHR, storage). The current owner request is complete; no unrelated backlog task started.
