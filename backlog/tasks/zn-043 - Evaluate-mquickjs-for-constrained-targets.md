---
id: ZN-043
title: Evaluate mquickjs for constrained targets
status: Done
assignee: []
created_date: '2026-10-06 14:50'
updated_date: '2026-10-06 20:25'
labels: []
dependencies: []
priority: medium
ordinal: 33300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On ESP32, RPi1, PS1 and PS2 the plan is typed AOT (ZN-042), not the bytecode interpreter. Evaluate MicroQuickJS (small-RAM QuickJS variant) as the compatibility engine for dynamic code (zinc:script) and as a fallback where no C++ toolchain is available: RAM and flash footprint, speed against our interpreter, JS subset, host-ABI binding. Vendor under third_party/ if adopted (prefer proven libraries).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 report with measured RAM, flash and speed on an ESP32-class budget (or a documented proxy) against the Zinc interpreter
- [x] #2 decision: adopt as compatibility engine, as fallback, or drop; written in docs/reports
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Built mquickjs (6d4d7eb), ran 4 kernels (ES5 rewrite), min heap by binary search, Thumb-2 -Os object sizes for mquickjs and the Zinc core (proxy, no board). Decision: drop for now, revisit conditions in docs/reports/zinc-next-mquickjs.md and decisions section 6.
<!-- SECTION:NOTES:END -->
