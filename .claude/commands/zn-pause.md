---
description: Pause the Zinc Next loop cleanly (finish or park the current task, stop the wake-ups)
---

Follow `.agents/skills/zn-pause/SKILL.md` (shared with Codex) with the reason `$ARGUMENTS`; in Claude Code step 2 is `ScheduleWakeup` with `stop: true` and `TaskStop` on every background job you started for the loop.
