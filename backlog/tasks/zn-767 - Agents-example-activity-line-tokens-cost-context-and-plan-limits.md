---
id: ZN-767
title: 'Agents example: activity line, tokens, cost, context and plan limits'
status: Done
assignee: []
created_date: '2026-10-20 11:20'
updated_date: '2026-10-20 11:20'
labels:
  - examples
  - desktop
  - ui
  - size-M
milestone: m-16
dependencies:
  - ZN-766
  - ZN-361.01
ordinal: 500430
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-20): in examples/agents, make the spinners turn (they stood still in the status bar and on the tool cards); fold a turn's tool cards into one activity line as Claude Code does (a spinner, what the agent does, the time and the tool count while it runs; `Used 12 tools · 3 agents · 41 s` once over, red when something failed or the turn was interrupted; a click shows the cards); show tokens, context and cost live per turn and per conversation, by model, kept with the transcript; show each provider's plan limits (the 5-hour session and the week, with their resets) refreshed on an interval set in Settings, 5 minutes by default, from what the CLIs expose only: never a credential file, a keychain item or an OAuth token, and no check that starts a model turn.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The spinners turn: zinc:ui paints rotate (ZN-361.01, its own fix(ui) commit); with reduced motion they stand still and the line says what runs in words (a running card says "running")
- [x] #2 While a turn runs, one line under its header: a spinner, a rotating verb or what the running tool does (`Reading src/app.ts…`, `Running npm test…`), the seconds and the tool count; the tool and subagent cards are folded by default, the choice is kept per conversation (meta.json)
- [x] #3 Once over: `Used N tools · M agents · time`, with a red marker and `1 failed` / `interrupted` / `error` when it applies; the answer text stays shown; a click unfolds the cards; the detail panel still lists everything
- [x] #4 Folded cards are not held: the window covers a range of seqs and holds only what is shown, folded lines are skipped unparsed on disk (a turn of 20 000 calls scrolls back as before: agents_memory)
- [x] #5 Tokens in and out (cache read and write included), context share of the model's window and cost, per turn (its header) and per conversation (status bar, by model on hover), live during a turn and kept in meta.json and the transcript; the CLI's cost when it reports one, else a small list-price table marked ≈, else no cost
- [x] #6 Plan limits per agent in the Agents panel and the status bar (hover detail, click to check again): Claude `claude -p /usage --output-format json --no-session-persistence` (a local command: num_turns 0, no cost) and its stream's rate_limit_event; Codex `codex app-server` account/rateLimits/read; opencode "unknown"; checked every N minutes (Settings, 1 to 60, 5 by default, settings.json)
- [x] #7 Fixtures of each source from the real CLIs (ids redacted) and examples/agents/tests/usage.test.ts; tests/t1/agents_usage.sh (spinner pixels move, still with reduced motion, the line unfolds and folds, the summary, the status bar's tokens, a restart, the interval stepper); agents_chat, agents_markdown and agents_memory pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checked on the real CLIs on 2026-10-20, read-only, in a temporary folder. Claude Code 2.1.304: message_start / message_delta usage per call, result total_cost_usd and modelUsage (tokens with the subagents', costUSD, contextWindow 1000000 for its Sonnet), rate_limit_event unifiedWindows five_hour / seven_day; `/usage` in print mode is a local command (local_command "usage", num_turns 0, total_cost_usd 0, duration_api_ms 0) that prints the session and week windows as text. codex-cli 0.162.1: exec --json gives only turn.completed usage (input counting the cached part), no cost, model or window; `codex debug models` gives each model's context_window; `codex app-server` over stdio answers account/rateLimits/read (primary 10080-minute window here, no secondary) without a model call. opencode 2.0.32: step_finish tokens and cost (0 on this plan), no model, no window, and no plan limits in any command (`opencode stats` is local history): shown as unknown.

Engine fix on the way: zinc:process run() left the child's stdin open, so `claude -p /usage` (which reads stdin when it is not a terminal) never ended; run() now closes it (fix(process) commit, tests/golden/host/process_stdin).

Ceilings (ponytail notes in the code): Codex's context is its turn's whole input (a turn of several calls overstates it); the window of a model the CLI does not give falls back to the previous turn's, then to a two-family table; the price table holds a few OpenAI list prices only, so a model outside it shows no cost rather than a guess. Unfolding the cards mid-conversation reads the same range again and the view may move.
<!-- SECTION:NOTES:END -->
