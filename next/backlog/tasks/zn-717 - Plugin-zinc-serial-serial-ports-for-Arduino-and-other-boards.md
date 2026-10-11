---
id: ZN-717
title: 'Plugin zinc:serial: serial ports for Arduino and other boards'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 16:10'
labels:
  - plugin
  - size-M
milestone: m-9
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 list ports, open with baud rate and framing, read lines and bytes, write, close, unplug reported; a proven vendored library or the POSIX API behind one file per platform
- [ ] #2 a pseudo-terminal test on the Mac: bytes written on one side are read on the other; an example that plots a value sent by a board
- [ ] #3 docs/plugins/serial.md
<!-- AC:END -->
