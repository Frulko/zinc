---
id: ZN-373
title: >-
  Zinc Inspector: a Zinc app that inspects and debugs programs over the same
  protocol
status: Backlog
assignee: []
created_date: '2026-10-08 15:16'
labels:
  - devtools
  - app
  - size-L
milestone: m-20
dependencies:
  - ZN-369
  - ZN-370
  - ZN-371
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: instead of (or besides) Chrome DevTools, a standalone Zinc app (or a panel of Zinc Atelier, app/atelier) that speaks the same Chrome DevTools protocol as a client to plugins/devtools: discovery of running programs (/json/list, local and over ssh), Elements tree with the box model overlay and live editing of spacing, sizes and colours, computed styles, Console, Network (with bodies and timings), Sources with breakpoints, stack, locals and watches, Performance traces, and the screencast. Written with zinc:ui and the WebSocket client (ZN-088), dogfooding the engine; nothing Chrome-specific needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the app lists running programs and attaches to one, showing its tree, styles and console (scripted test against a headless program)
- [ ] #2 editing padding in the app changes the target's frame; the network and debugger views work against the targets of ZN-370 and ZN-371
- [ ] #3 it runs on macOS and Linux and inspects a program on the Pi through ssh forwarding
<!-- AC:END -->
