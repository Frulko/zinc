---
description: Start or resume a Zinc Next session (reads next/RESUME.md and the current task)
argument-hint: [task number, optional]
---

Resume Zinc Next work.

1. Read `next/RESUME.md` and `next/TESTING.md`. Read nothing else yet.
2. Pick the task: `$ARGUMENTS` if given, else the task already In Progress, else the first Ready task
   (`backlog task list --plain`). Read it with `backlog task <id> --plain`.
3. Check `git status --short next/` and `git log -3 --oneline`, in case the last session stopped abruptly.
4. Set the task In Progress (`backlog task edit <id> -s "In Progress"`), then state in 3 lines: the task, its acceptance
   criteria, and your plan. Then work on that one task only.

Rules: run only the smallest test tier that proves the change, with quiet output. Commit explicit paths, never
`git add .`. Stop and ask if the task exceeds 1.5× its size budget.
