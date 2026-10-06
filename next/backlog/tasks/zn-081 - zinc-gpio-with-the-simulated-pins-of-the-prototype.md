---
id: ZN-081
title: 'zinc:gpio with the simulated pins of the prototype'
status: Backlog
assignee: []
created_date: '2026-10-06 22:52'
labels:
  - host-modules
  - simulator
  - size-S
milestone: m-14
dependencies: []
ordinal: 40230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port runtime/mod/gpio.cpp (pins, modes, pull, read/write, interrupts, PWM, ZINC_GPIO_SCRIPT scripted inputs, the keyboard-driven button of iot-panel) as __host_gpio* rows over the system host; the Linux libgpiod backend becomes the real implementation on a Pi later (plugin of the target, LGPL stays out of the core).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 scripted pin test: a ZINC_GPIO_SCRIPT drives an input and a program sees the edges; outputs are logged identically to the prototype
- [ ] #2 examples/iot-panel and video/looper pass the module step
<!-- AC:END -->
