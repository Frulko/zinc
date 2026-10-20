---
id: ZN-770
title: 'Agents example: OpenCode Go usage read with the Go key'
status: Done
assignee: []
created_date: '2026-10-20 15:30'
updated_date: '2026-10-20 15:30'
labels:
  - examples
  - desktop
  - security
  - size-S
milestone: m-16
dependencies:
  - ZN-768
ordinal: 500460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-20): show OpenCode Go's plan usage (5-hour, week, month, with % and reset time, rate-limited in red) in the Agents panel and the status bar like Claude's and Codex's, read from opencode.ai's usage route (`GET https://opencode.ai/zen/go/v1/usage`, anomalyco/opencode PR #16513, undocumented) with the user's Go key. The key comes only from `opencode auth export` (the active `opencode-go` API key, nothing else), stays in memory for that one request, goes to opencode.ai over https in the Authorization header only, and is never written, logged or passed to a child. A Settings toggle, on by default, turns it off.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings: « Read OpenCode Go usage with my Go key », on by default, kept in settings.json; off shows « unknown » and the console link and runs no `opencode auth export`
- [x] #2 The 5-hour, week and month bars with % and reset in the Agents panel, the status bar item and its hover; a rate-limited window in red; the same refresh interval
- [x] #3 A short reason for no key, a revoked or expired key, a 403, a route that changed (404, an unknown answer, a move off opencode.ai), then « unknown » and the console link
- [x] #4 `zinc:net` fetch drops Authorization, Proxy-Authorization and Cookie on a redirect to another origin (own fix(net) commit, tests/golden/host/net)
- [x] #5 Tests: examples/agents/tests/usage.test.ts (goLimits, goKeyOf), tests/t1/agents_go.sh (fake export, fixtures for the route, the toggle, each refusal, the fake key absent from data, settings, output, scenes and every child's arguments and environment)
- [x] #6 One read-only check against the real route (usage GET only, no model turn)
<!-- AC:END -->
