---
id: ZN-630
title: 'Accessibility bridges on ios and android from the zinc:ui tree'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:08'
labels:
  - mobile
  - size-L
milestone: m-26
dependencies:
  - ZN-625
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mirror the tree of ZN-276 (role, label, hidden, disabled, bounds, actions) as `UIAccessibilityElement`s and through an `AccessibilityNodeProvider`; focus and activate come back as UI events (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the platform dumps (Accessibility Inspector, `uiautomator dump`) list the same nodes as `ui.inspect()` (the tree of ZN-276 as text) for rn-showcase
- [ ] #2 activating a button by the screen reader presses it
<!-- AC:END -->
