---
id: ZN-1095
title: Preserve component ownership in model-neutral JSX
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 18:11'
labels:
  - ui
  - frontend
  - size-M
milestone: m-32
dependencies: []
ordinal: 1013
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ordinary conditional CalendarMonth in ZN-1078.07 and stateful virtual cells/editors in ZN-1078.12. Picker sub-agent reproduced exact compiler wiring in `.worktrees/1078-pickers/.logs/picker-host-ownership/`: bounded static check passes; lowered.log line8 gives the outer React component `_rc`, while line40 lowers a model-neutral library's ordinary conditional Stateful JSX to `_show(... _append(... Stateful({})) ...)` with no child `_rc`. Host._show/_comp call the child inline under React. Thus the hooks are attributed to the parent, and virtual rows build with React current owner null. Runtime cleanup/state assertions are prepared but unrun because another session holds the app queue. This is a source wiring finding, not a claimed runtime test result.

Primary research by Picker sub-agent: https://react.dev/reference/rules/react-calls-components-and-hooks (the reconciler owns component identity; direct conditional calls break hooks), https://react.dev/learn/preserving-and-resetting-state (removed child state is discarded), https://react.dev/reference/react/useEffect (cleanup on removal/dependency change).

Fix the shared neutral JSX/helper boundary with component identity/key and existing React instance ownership. Preserve Solid's tracked versus untracked behavior and cleanup, normal JSX source, and both kit/Nuxt host consumers. No always-hidden second calendar, hand-managed conditional hook array, component registry or widget-specific compiler patch. Coordinate canonical kit/host ownership with the coordinator: Picker checkpoint2476e9887 contains separate new helpers; avoid importing unrelated unverified UI source. Keep library layer direction and arbitrary custom JSX helper compatibility explicit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Normal nested and conditional model-neutral JSX components have distinct React identities, keys, persistent state while mounted and fresh state after removal/remount; Solid behavior remains coherent on all engines
- [ ] #2 Exact regression proves effect cleanup exactly once on removal, sibling state isolation, keyed reorder and stateful virtual row creation/disposal without owner-null hooks or stale handles
- [ ] #3 Ordinary Picker one/two-month toggle and Data stateful virtual editor/custom-cell proof pass without UI workarounds; proposed milestone checks and actual limits are recorded
<!-- AC:END -->
