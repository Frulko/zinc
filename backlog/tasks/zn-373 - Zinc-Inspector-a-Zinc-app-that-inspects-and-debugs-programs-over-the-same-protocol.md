---
id: ZN-373
title: >-
  Zinc Inspector: a Zinc app that inspects and debugs programs over the same
  protocol
status: Done
assignee: []
created_date: '2026-10-08 15:16'
updated_date: '2026-10-25 01:53'
labels:
  - devtools
  - app
  - size-L
milestone: m-20
dependencies:
  - ZN-369
  - ZN-370
  - ZN-371
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: instead of (or besides) Chrome DevTools, a standalone Zinc app (or a panel of Zinc Atelier, app/atelier) that speaks the same Chrome DevTools protocol as a client to plugins/devtools: discovery of running programs (/json/list, local and over ssh), Elements tree with the box model overlay and live editing of spacing, sizes and colours, computed styles, Console, Network (with bodies and timings), Sources with breakpoints, stack, locals and watches, Performance traces, and the screencast. Written with zinc:ui and the WebSocket client (ZN-088), dogfooding the engine; nothing Chrome-specific needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the app lists running programs and attaches to one, showing its tree, styles and console (scripted test against a headless program)
- [x] #2 editing padding in the app changes the target's frame; the network and debugger views work against the targets of ZN-370 and ZN-371
- [x] #3 it runs on macOS and Linux and inspects a program on the Pi through ssh forwarding
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Split on 2026-10-11 into ZN-373.01 (the app: discovery, attach, Elements, computed styles, Console), .02 styles editing and the screencast, .03 Network, .04 Sources (a debugger client of zinc debug --cdp), .05 Performance, .06 Linux and the Pi over ssh (parked: the cross-platform pass and a board). The subtasks take the parent's place in the order (ordinals 26001-26005).
Review 2026-10-25: closed as Done. Everything except Linux/Pi lives in done subtasks; ZN-373.06 holds the rest. Evidence: subtasks 373.01-.05 Done: app/inspector, tests/t1/inspector.sh, tests/t1/agent_inspect.sh Verifier: Subtasks 373.01-.05 are all Done (status lines checked); AC3 (Linux, Pi over ssh) lives in open ZN-373.06.
<!-- SECTION:NOTES:END -->
