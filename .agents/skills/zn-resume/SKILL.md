---
name: zn-resume
description: Resume the Zinc backlog loop after zn-pause and show where it stands. Use when the owner asks to resume or restart the loop.
---

1. Delete `.paused` at the repository root if it exists.
2. Run `tools/status` and summarise in 4 lines: current tasks and their criteria, uncommitted work, what the last commits did, the next task (`tools/next-task`). Change nothing else.
3. Restart the loop unless only a status was asked: in Claude Code `/loop` with the zn-coordinate prompt (dynamic mode); with Codex, `tools/codex-loop`.
