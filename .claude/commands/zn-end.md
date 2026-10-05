---
description: End a Zinc Next session (task status, commit, RESUME.md)
---

End the Zinc Next session:

1. Check the acceptance criteria of the current task against real test output. Tick the ones that pass
   (`backlog task edit <id> --check-ac <n>`). Set the status: Review if criteria remain, Done only if all pass.
2. Add a note to the task: what was done, what failed, and the `/usage` figure if the user gives it.
3. Commit only the files of this unit, with explicit paths (conventional commit, English, no co-author).
4. Overwrite `next/RESUME.md`: state, next command, what is broken, anything uncommitted. Commit it.
5. Reply with 3 lines: done, not done, next task.
