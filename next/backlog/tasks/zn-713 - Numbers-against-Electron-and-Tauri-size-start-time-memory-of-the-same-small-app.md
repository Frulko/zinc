---
id: ZN-713
title: >-
  Numbers against Electron and Tauri: size, start time, memory of the same small
  app
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-11 16:08'
updated_date: '2026-10-11 18:32'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the same small app (a window, a list, a text field, an image) exists for Zinc, Electron and Tauri in a bench directory, with the script that builds and measures them
- [ ] #2 size on disk of the shipped app, time from launch to first frame and resident memory after 10 s are measured on the development Mac, alone on the machine, five runs each, and logged in docs/reports/zinc-next-perf.md
- [ ] #3 where Zinc is not clearly ahead, the cause is named and given as lines for next/backlog/later.md
<!-- AC:END -->
