---
id: ZN-639
title: 'socket test: free UDP ports instead of 9731 and 9732'
status: Backlog
assignee: []
created_date: '2026-10-10 17:01'
labels:
  - devtools
  - test
  - size-S
milestone: m-20
dependencies: []
ordinal: 7100
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/golden/host/socket.ts binds the fixed UDP ports 9731 and 9732, so two trees (the loop and a parallel worktree) cannot run socket.sh at once; the TCP and inspector ports already come from tests/free_ports.py (ZN-633). (Follow-up of ZN-633, D63.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 socket.sh passes when started twice at the same time
<!-- AC:END -->
