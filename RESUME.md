# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## 2026-10-22: Kanban editor focus corrected (ZN-775)

- Modify now focuses the prefilled Markdown description immediately after its conditional field mounts and the opening pointer press finishes. Reopening a retained edit restores its draft and keyboard focus; typing in another field does not rerun autofocus.
- Regression first failed on the old implementation's focused field. The test now starts with a nonempty Markdown description, inspects real title/body fields before typing, types without clicking, closes/reopens the draft and verifies focus/content, then saves and comments through the CLI in a temporary backlog.
- Proof: Kanban type check, kanban_logic and T1 kanban passed (scripted interactions, scroll/drag regression, idle and native/QuickJS smoke). Editor feature capture reviewed, only frame 225 changes (focused outline/caret). Other feature hashes unchanged.
- Run: `ZINC_BACKGROUND=1 build/zinc run examples/kanban`; restart an older running instance. Title/description remain the editable fields; plan, notes, criteria and summary stay read-only. No engine changes or dependencies. No cross-target/device or screen-reader run, nothing pushed.
- Unrelated fatty demo/test work left untouched. Usage: n/a for Codex.

## Earlier known limits (unrelated, not re-investigated)

- Prior resume recorded diagnostics, netlog and Windows pixel test failures, plus an agent_ota CI flake. Verify these in their own tasks, not while changing a demo.
- Mobile follow-ups remain in their tasks and `backlog/later.md`: ZN-744/741 rendering on Nexus 7, ZN-627 Android GLES 3, ZN-746 software rendering, ZN-743 hero; ZN-631 real Nexus 7 QR scan is in Review. Do not disturb the owner's music app on the tablet. Paid store/device publishing remains the owner's step.

## Next

`tools/next-task`: ZN-568 — Web environment module for QuickJS contexts (DOM/BOM, events, rAF, fetch/XHR, storage). The current owner request is complete; no unrelated backlog task started.
