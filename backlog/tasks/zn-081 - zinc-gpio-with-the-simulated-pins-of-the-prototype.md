---
id: ZN-081
title: 'zinc:gpio with the simulated pins of the prototype'
status: Done
assignee: []
created_date: '2026-10-06 22:52'
updated_date: '2026-10-07 02:53'
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
- [x] #1 scripted pin test: a ZINC_GPIO_SCRIPT drives an input and a program sees the edges; outputs are logged identically to the prototype
- [x] #2 examples/iot-panel and video/looper pass the module step
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc:gpio as a built-in Zinc source (pins, modes, pull, edges with debounce as microtasks, ZINC_GPIO_SCRIPT timers); the fixture's output equals the old simulator's. iot-panel now stops on zinc:osc, video/looper passes the gpio step; the global isNaN/isFinite (number arguments) also landed, which promoted canvas/sketch and video/looper in tests/examples.lst. PWM and the libgpiod backend are not part of the simulated board.
<!-- SECTION:NOTES:END -->
