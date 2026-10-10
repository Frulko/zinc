---
description: End a Zinc Next session (task status, usage, commit, RESUME.md, next task)
---

End the Zinc Next session:

0. Tests of the unit only: `next/tests/run --changed` and the task's own test; the demos and T2 are not part of ending a task.
1. Check the acceptance criteria of the current task against real test output. Tick the ones that pass (`backlog task edit <id> --check-ac <n>`).
   Set the status: Done when all pass; otherwise split what is left into new tasks (`backlog task create ... --dep <id>`) and set Done, or Review if the rest
   needs a person (say what in the notes). Never leave a task half open without a follow-up task. Create a follow-up without an ordinal (no `--ordinal`, no `ordinal_base`): it queues at the end of the list until the next backlog review; only a defect that stops a demo from running gets a place, right after the task that found it.
2. Record usage without asking: run `next/tools/usage` and add its line plus what was done and what failed to the task notes (`backlog task edit <id> --notes ...`).
3. Commit only the files of this unit with explicit paths, task file included. English conventional commit (`type(scope): imperative description`, no final period,
   72 chars max, no co-author). One commit per logical unit.
4. Update `next/RESUME.md` (keep it short and true): state, next command, what is broken, anything uncommitted, usage per milestone. Commit it.
5. Run `next/tools/next-task`. Reply with 3 lines (done, not done, next task); the last line is `NEXT: ZN-xxx` or `STOP: nothing left` (the only stop) so a loop can read it.

In a parallel worktree (AGENTS.md, "Several tasks at once"): stop after step 3. No `RESUME.md`, no new task, no decision number; put the follow-ups, decisions and numbers in the task notes and in your report to the coordinator.
