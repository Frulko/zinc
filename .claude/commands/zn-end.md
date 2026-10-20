---
description: End a Zinc Next task or batch (task status, commit; once per batch: usage, RESUME.md, next task)
---

End the Zinc Next session. Steps 0 to 3 close one task; in a batch (`/zn-start`) they run after each task, and steps 4 and 5 once, after the last one:

0. Tests of the unit only: `tests/run --changed` and the task's own test; the demos and T2 are not part of ending a task.
1. Check the acceptance criteria of the current task against real test output. Tick the ones that pass (`backlog task edit <id> --check-ac <n>`).
   Set the status: Done when all pass; otherwise the task stays open: back to Backlog with a handover note (what is done, what fails, the next command),
   or Review if the rest needs a person, a board or another machine (say what in the notes). No follow-up task: the backlog is frozen (AGENTS.md, "Keep the
   backlog shrinking"). What you would have filed is one line in `backlog/later.md` (`- ZN-n: what, and why it matters`), committed with the task.
   Only an owner request, a defect that stops a demo or a test of develop, or the split of a task too big adds a task file, and its commit carries the trailer
   `New-task: owner ...`, `New-task: blocks ...` or `New-task: split ZN-n` (the `commit-msg` hook refuses it otherwise).
2. Add what was done and what failed to the task notes (`backlog task edit <id> --notes ...`); once per batch, on its last task, run `tools/usage`
   and add its line too, without asking.
3. Commit only the files of this unit with explicit paths, task file included. English conventional commit (`type(scope): imperative description`, no final period,
   72 chars max, no co-author). One commit per logical unit.
4. Update `RESUME.md` (keep it short and true): state, next command, what is broken, anything uncommitted, usage per milestone. Commit it.
5. Run `tools/next-task`. Reply with 3 lines (done, not done, next task); the last line is `NEXT: ZN-xxx` or `STOP: nothing left` (the only stop) so a loop can read it.

In a parallel worktree (AGENTS.md, "Several tasks at once"): stop after step 3. No `RESUME.md`, no new task, no decision number; put the lines for `backlog/later.md`, the decisions and the numbers in the task notes and in your report to the coordinator.
