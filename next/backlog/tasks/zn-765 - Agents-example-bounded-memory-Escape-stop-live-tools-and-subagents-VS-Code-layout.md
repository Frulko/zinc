---
id: ZN-765
title: >-
  Agents example: bounded memory, Escape stop, live tools and subagents, VS Code
  layout
status: Done
assignee: []
created_date: '2026-10-19 23:59'
updated_date: '2026-10-20 00:01'
labels:
  - examples
  - desktop
  - ui
  - size-L
milestone: m-16
dependencies: []
ordinal: 500410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-20): make examples/agents a usable ADE for long sessions. The conversation's context lives in each CLI's session; the app keeps a JSONL transcript per conversation on disk and holds only a bounded window in memory, stops a turn with Escape at any time, shows tool calls and subagents live and in detail, and is laid out like VS Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A conversation's items go to a JSONL transcript on disk; memory holds at most 120 items and 512 KB of text per shown conversation; older items load on scroll up and are dropped again; big outputs are cut in memory and read from disk in parts by Show all; stdout is split with a bounded 4 MB line buffer
- [x] #2 next/tests/t1/agents_memory.sh: one turn of 20000 tool calls and 200 MB of output keeps window, open items, characters, UI nodes, live objects and resident memory under fixed ceilings, the UI keeps refreshing during the flood, scrolling back reads older items and scrolling down returns to the end
- [x] #3 Escape (even with the message field focused) and the Stop button send SIGINT, then SIGTERM and SIGKILL after 1.5 s each; the turn reads interrupted and the next message resumes the session; examples/agents/tests/turn.test.ts covers the state machine
- [x] #4 Tool calls are collapsible cards (icon, name, summary, live status, duration, input, truncated output) for Claude (tool_use, input deltas, parent_tool_use_id), Codex (command_execution, file_change, mcp_tool_call, reasoning) and opencode (tool parts); subagents nest under their agent card; a right detail panel lists the turn's agents and tools; one fixture per real CLI in examples/agents/tests/fixtures read by parse.test.ts
- [x] #5 VS Code layout: activity bar (Conversations, Folders, Agents, Settings), conversations by folder with agent, title, status dot and relative time, search and +, tabs, collapsible detail panel, status bar with agent, model, mode, running turns and memory; light and dark schemes; reduced motion respected
- [x] #6 Discovery, mode/model/effort/fast and the file viewer still work: next/tests/t1/agents_chat.sh passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Engine fix found on the way: __pollHost (next/src/frontend/modules.cpp) drained host events while any were ready, and a child writing without pause kept it there, starving timers, frames and input; it now takes at most 64 events per turn. Regression: tests/golden/host/process_flood.ts in tests/t0/host.sh. Checked on the real CLIs on 2026-10-20 (read-only, temporary folder): the three stream formats (fixtures), and Claude Code 2.1.304's SIGINT mid-turn (error result, exit 0) followed by --resume, which kept the interrupted text. Not tried on the real CLIs: Codex and opencode under SIGINT, their subagents and MCP calls. Measured (agents_memory, loaded M-series Mac): window 240, open 4, 494 KB, 4680 nodes, 68000 objects, resident peak 115-150 MB (ceiling 224 MB), about 25 MB after the turn.

Reduced motion: with the reducemotion signal a running turn paints nothing at idle (paint p50 0.00 against 0.17); whether the macOS desktop host sends that signal was not checked. Closing the window during a turn still leaves its CLI running (no quit hook in zinc:ui).
<!-- SECTION:NOTES:END -->
