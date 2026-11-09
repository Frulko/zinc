---
description: Start or resume a Zinc Next session (one batch of tasks, each start to end)
argument-hint: [task number, optional]
---

If `.paused` exists: stop the loop (`ScheduleWakeup` with `stop: true`) and answer `STOP: paused`.

Otherwise follow `.agents/skills/zn-start/SKILL.md` (shared with Codex) with the arguments `$ARGUMENTS`. The web search of step 4 is an `Agent` call with `model: "sonnet"`.
