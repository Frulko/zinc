---
id: ZN-043
title: Evaluate mquickjs for constrained targets
status: Backlog
assignee: []
created_date: '2026-10-06 14:50'
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
- [ ] #1 report with measured RAM, flash and speed on an ESP32-class budget (or a documented proxy) against the Zinc interpreter
- [ ] #2 decision: adopt as compatibility engine, as fallback, or drop; written in docs/reports
<!-- AC:END -->
