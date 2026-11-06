---
id: ZN-999
title: Remove the ignored zinc.json crash policy
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 07:48'
labels:
  - size-S
  - tools
dependencies: []
ordinal: 758080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From ZN-994: the zinc.json key "crash" (exit/redbox/restart) is accepted and ignored, ZRT_CRASH defaults to 0 and nothing calls zrt::app_main, while docs/dev-mode.md documents it. Owner decision 2026-11-06: remove the key and its docs rather than wire it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc.json "crash" gives a clear diagnostic that the key is gone (zinc explain entry), instead of being silently accepted
- [ ] #2 docs/dev-mode.md and any other doc, template or example no longer mention the crash policy
- [ ] #3 Dead code only reachable through the policy is removed or left with a one-line reason; tests/t0/zrt_restart.sh still builds and passes
<!-- AC:END -->
