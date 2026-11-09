---
name: zn-pause
description: Pause the Zinc backlog loop cleanly (finish or park the current task, stop the wake-ups). Use when the owner asks to stop or pause the loop.
---

1. Create the marker `.paused` at the repository root (git-ignored) with the date and the reason.
2. Stop the loop: in Claude Code `ScheduleWakeup` with `stop: true` and stop every background job you started; under `tools/codex-loop` the marker is enough (the loop checks it before each iteration).
3. The current task: if its acceptance criteria are not all checked, leave it In Progress (or Review when only documented gaps remain), commit your own finished files with explicit paths, and note in the task notes what is left. Never discard work. Worker agents still running: let them report and integrate them, or release their tasks (`tools/next-task --release`).
4. Reply in French in 3 lines: where the task stands, what is uncommitted, and that zn-resume restarts everything.

While `.paused` exists, zn-start and zn-coordinate do nothing and answer `STOP: paused`.
