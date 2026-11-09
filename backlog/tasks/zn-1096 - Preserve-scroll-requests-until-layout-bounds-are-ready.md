---
id: ZN-1096
title: Preserve scroll requests until layout bounds are ready
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 19:06'
updated_date: '2026-11-09 20:51'
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
- [x] #1 Initial, hidden/detached and dirty-layout scroll requests preserve the latest x/y and animation intent, apply after current bounds exist, and then clamp normally; an explicit final zero request is honored
- [x] #2 Existing restoration and imperative callers, including row alignment, remain coherent; animated/reduced-motion paths and per-window ownership are explicit
- [x] #3 Focused T0 proves both axes, repeated requests, grow/shrink, hidden reveal, virtual rows and destroy/reuse across the three engines without stale callbacks or queued-handle leakage
- [ ] #4 The original small repro and ordinary WheelPicker/Ruler initial selection pass with bounded feature smoke; documentation, changelog and proposed milestone checks are recorded
<!-- AC:END -->

## Implementation and exact proof — 2026-11-09

Need → provider → gap: existing `restoreScrolls` already ran after layout and before virtual settling; generalized that one queue to retain raw offsets, animated intent, relative shifts, row indices and saved-key restoration. One request enum and transition function, node object plus serial, cancellation on release, no per-frame timer or new public API. Only ready bounds attached to the current root/layer consume requests. A request from another surface immediately marks surfaces for layout, including when no UI tree is mounted in the main window. Latest intent wins; pending relative movement adds to that intent. Explicit offsets override initial stick-to-bottom anchoring. The private apply path avoids recursively queuing a virtual-list layout change.

- Verified primary Flutter attach documentation: attached positions lack content dimensions until layout (https://api.flutter.dev/flutter/widgets/ScrollController/onAttach.html). React Native's current pending-offset/onLayout implementation agrees (https://raw.githubusercontent.com/facebook/react-native/main/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/scroll/ReactScrollView.kt). No new dependency.
- Original three-frame Solid repro now prints `initial scroll: 200`, exit0, using source-root this worktree and the newly built engine. Log `.logs/1096/original.log`.
- `tests/run --only scroll_request` PASS: classic and Yoga × interpreter/AOT/QuickJS. Both axes, repeated/zero requests, grow/shrink, hidden reveal, detached stale parent, relative pending shifts, retained animation targets, current reduced-motion policy, key ordering, unmounted restore preservation, recycled node generation, fixed and variable virtual rows and row restoration. A separate short headless logical-window fixture has no main UI root, proving foreign-surface wake/application and no repeated layout while hidden. No window is activated; owned logical window closes before exit. Log `.logs/1096/test.log`.
- Read scrollTo/scrollBy/scrollToRow callers in std/kit, dnd, a11y, Inspector, Atelier and demos. Existing gesture-relative shift updates axis position/raw/target/history together. `clampScroll` remains a no-op during live physics, preserving rubber band/momentum. No caller rewrite.
- Original Picker QuickJS proof is being completed in the fresh Picker worktree with the provisional UI patch excluded from its commit. Interpreter/AOT callers currently hit independent frontend constructor/guard/nullable-cleanup issues reserved as1097/1098/1099. Therefore AC4 stays open until the original WheelPicker/Ruler proof returns; no delayed-frame workaround or Done claim.
- Integration: main's independent sparse-Fenwick WIP must keep `vRowH(v, i)` in the extracted `rowScrollOffset` helper. All other external hunks remain untouched.

### Proposed tests

- `tests/run --only scroll_request`: exact bounds/lifetime/physics targets plus headless window ownership, roughly seconds after warm AOT cache.
- Original WheelPicker/Ruler interaction in both models and all engines, including nonzero first value, reattachment, native keyboard/touch and reduced motion; short feature proof first, longer physical-device/browser accessibility replay at owner-chosen milestone.
- Quiet-machine long virtual-scroll/restore memory/energy measurement; not run, no speed or memory claim.
