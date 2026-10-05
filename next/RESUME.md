# Zinc Next: resume

Overwritten at the end of every session. Read this and the current task (`backlog task list --plain`), nothing else.

## State

- Date: 2026-10-05. Phase: planning done, no code yet.
- Design: `docs/reports/zinc-next-design.md` (C++20, typed SSA IR, ZBC interpreter as reference, AOT derived from it).
- Backlog: 31 tasks in `next/backlog/tasks/`, milestones M0–M6. Ready: ZN-001, ZN-002, ZN-003.
- Nothing in progress. No code under `next/` besides the backlog.

## Next

Start ZN-001 (freeze the corpus outputs): `backlog task edit 1 -s "In Progress"`.

## Watch out

- The working tree has many unrelated uncommitted changes (compiler, examples, plugins). Never `git add .`; add paths explicitly.
- Do not touch the existing compiler in `compiler/` except for fixes.
- Estimates (sizes, 6–8 months) are unvalidated; ZN-011 is the first decision gate.
- Note `/usage` in the task notes at the end of each session to measure cost per milestone.
