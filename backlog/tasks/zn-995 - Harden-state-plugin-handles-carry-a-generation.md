---
id: ZN-995
title: 'Harden state: plugin handles carry a generation'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 07:23'
labels:
  - size-M
  - plugins
  - hardening
dependencies: []
ordinal: 754080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/implicit-state-machines.md (#18, #19, #21, screen-capture). Slot tables reuse the lowest free index, so queued events and stale objects reach a new object. Reproduce first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 script: a disposed Script cannot evaluate in, or settle a call of, a VM that reused its handle; regression test
- [ ] #2 socket: a deferred event for a freed handle is never delivered to (or frees) a socket that reused the slot; regression test
- [ ] #3 webview: close() drops the view's queued events and pending invoke replies; a stale WebView after close() is inert; regression test on the sim backend
- [ ] #4 screen-capture: a late stop callback of an old stream cannot change the state of a new session in the same slot
<!-- AC:END -->
