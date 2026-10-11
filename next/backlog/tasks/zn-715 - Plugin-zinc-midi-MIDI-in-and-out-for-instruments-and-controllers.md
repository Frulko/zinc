---
id: ZN-715
title: 'Plugin zinc:midi: MIDI in and out for instruments and controllers'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 16:09'
labels:
  - plugin
  - size-M
milestone: m-9
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 list ports, open one, receive and send notes, control changes and clock, hot-plug events; a proven vendored library (licence and pinned version), no code of our own for the platform APIs
- [ ] #2 a virtual port test on the Mac: a message sent is received byte for byte; an example that plays a note from a key
- [ ] #3 docs/plugins/midi.md
<!-- AC:END -->
