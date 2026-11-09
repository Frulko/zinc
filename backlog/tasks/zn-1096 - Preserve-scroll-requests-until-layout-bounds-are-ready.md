---
id: ZN-1096
title: Preserve scroll requests until layout bounds are ready
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 19:06'
labels:
  - ui
  - layout
  - size-M
milestone: m-32
dependencies: []
ordinal: 1014
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ordinary WheelPicker/Ruler initial nonzero selection in ZN-1078.07. Root ran `.worktrees/1078-pickers/.logs/picker-initial-scroll/main.tsx` against the new core binary: a 100x100 ScrollView containing a 500px child, Solid createEffect calling scrollTo(0,200) before mount, then frame2 reads0 and throws. Bounded three-frame interpreter run exited101; nothing remains running. The request is clamped against zero content dimensions before layout; animated targets have the same issue. Fix the engine, never a delayed-frame picker workaround.

Research by a separate read-only agent: React Native stores raw pending offsets until content is ready, replayed in onLayout; smooth scrolling also retains intent. Primary implementations: https://github.com/react/react-native/blob/main/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/scroll/ReactScrollView.kt#L398-L404 and #L1075-L1132; horizontal counterpart https://github.com/react/react-native/blob/main/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/scroll/ReactHorizontalScrollView.kt#L1382-L1428. Flutter distinguishes attachment from content dimensions and restores offsets before layout: https://api.flutter.dev/flutter/widgets/ScrollController/onAttach.html, https://api.flutter.dev/flutter/widgets/ScrollPosition/restoreOffset.html, https://api.flutter.dev/flutter/widgets/ScrollPosition/applyContentDimensions.html.

Reuse/generalize existing scroll restoration and its placement after layout before virtual settling. Retain raw intent until valid bounds exist; latest request wins, including zero and animation changes. Use one explicit request enum/transition, identity+serial and disposal cleanup, no offset sentinel or extra frame timer. Keep scrollKey precedence explicit. Review scrollBy, scrollToRow (alignment currently uses lh immediately), variable-row restoration, selection/dnd/accessibility callers and classic/Yoga paths. Keep requests in their owning window context. Avoid recursive requeue when application dirties virtual layout.

Main tree has another session's Virtual/Fenwick UI changes around636/967: preserve them, inspect both representations and use isolated source changes. This goes to a fresh sole core worker after the current five-task batch, not a second concurrent UI core writer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Initial, hidden/detached and dirty-layout scroll requests preserve the latest x/y and animation intent, apply after current bounds exist, and then clamp normally; an explicit final zero request is honored
- [ ] #2 Existing restoration and imperative callers, including row alignment, remain coherent; animated/reduced-motion paths and per-window ownership are explicit
- [ ] #3 Focused T0 proves both axes, repeated requests, grow/shrink, hidden reveal, virtual rows and destroy/reuse across the three engines without stale callbacks or queued-handle leakage
- [ ] #4 The original small repro and ordinary WheelPicker/Ruler initial selection pass with bounded feature smoke; documentation, changelog and proposed milestone checks are recorded
<!-- AC:END -->
