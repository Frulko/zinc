---
id: ZN-1082
title: Accept dynamic JSX grab policy
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 12:15'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1071
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the vertical/horizontal Slider in examples/ui/kit-gallery (ZN-1078.08). src/frontend/jsx.cpp only accepts literal grab keywords. Valid View grab={vertical ? 'keep' : 'keep-x'} is rejected with Z0005. Preserve the original component expression and fix the shared frontend path for Solid/React, interpreter/AOT/QuickJS.

Supported Zinc-owned values only: keep=1 (scroll never steals), keep-x=2 (mostly horizontal gestures kept; vertical can scroll), auto/default=0. There is no keep-y; no new enum value or gesture-machine feature is requested. Existing native setNumber(grab) already applies these policies; preserve literal diagnostics, evaluate a dynamic expression once per apply and reapply reactively, use existing default behavior for unknown dynamic values.

Research delegated before work: Zinc docs/ui.md section gesture arbitration, adjacent pointerEvents/inputMode dynamic lowering; Flutter https://api.flutter.dev/flutter/widgets/RawGestureDetectorState/didUpdateWidget.html synchronizes recognizer configuration; RNGH https://docs.swmansion.com/react-native-gesture-handler/docs/legacy-gestures/gesture-detector/ updates native handlers from config and https://docs.swmansion.com/react-native-gesture-handler/docs/guides/troubleshooting/ distinguishes updates from active gesture state. Zinc grab is its own scroll arbitration policy, not HTML touch-action or DOM pointer capture. Reuse existing frontend mapping/binding machinery; no runtime gesture rewrite or component workaround.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dynamic grab maps the existing keep, keep-x and auto policies on Solid and React across interpreter, AOT and QuickJS
- [ ] #2 A narrow T0 covers one expression evaluation, reactive policy updates, default handling and unchanged invalid literal diagnostics
- [ ] #3 The original Selection slider with its supported dynamic grab expression checks and runs without a component workaround
<!-- AC:END -->
