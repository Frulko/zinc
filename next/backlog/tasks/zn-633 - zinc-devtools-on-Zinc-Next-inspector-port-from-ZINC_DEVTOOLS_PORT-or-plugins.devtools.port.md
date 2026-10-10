---
id: ZN-633
title: >-
  zinc:devtools on Zinc Next: inspector port from ZINC_DEVTOOLS_PORT or
  plugins.devtools.port
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:27'
updated_date: '2026-10-10 16:33'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zinc Next listens on 9229 only, so the socket, dev_mode and netlog tests cannot run in parallel and netlog.sh skips (77) when 9229 is busy. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 two programs are inspected at once on different ports
- [ ] #2 netlog.sh and socket.sh use their own port and run together
<!-- AC:END -->
