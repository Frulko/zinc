# Zinc Next: backlog

The backlog lives in [Backlog.md](https://github.com/MrLesk/Backlog.md) (config: `backlog.config.yml`, tasks:
`next/backlog/tasks/`, milestones M0–M6). Design: [docs/reports/zinc-next-design.md](../docs/reports/zinc-next-design.md).

```sh
backlog board view          # kanban in the terminal
backlog browser             # drag-and-drop board at http://localhost:6420
backlog task list --plain   # for agents
backlog task edit 7 -s "In Progress"
```

Testing tiers, demos and thresholds: [TESTING.md](TESTING.md).

Columns: Backlog → Ready → In Progress → Review → Done. At most one task In Progress.

## Rules

- One session = one task. A task is Done only when its acceptance criteria pass, not when the code is written.
- Sizes (labels `size-S/M/L`): S ≈ 1 session, M ≈ 2–3, L ≈ 4+. Estimates, unvalidated.
- End of session: update the task status, commit the unit (conventional commits, English), update `next/RESUME.md`.
- ZN-011 is a decision gate: continue, simplify or stop, with measurements and `/usage` noted.

Personas used in the stories: **Maintainer**, **App developer**, **Device user**, **CI**.
