---
id: ZN-630
title: 'Accessibility bridges on ios and android from the zinc:ui tree'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:08'
updated_date: '2026-10-17 00:56'
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
- [x] #1 the platform dumps (Accessibility Inspector, `uiautomator dump`) list the same nodes as `ui.inspect()` (the tree of ZN-276 as text) for rn-showcase
- [x] #2 activating a button by the screen reader presses it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-10-17). zinc:ui sends the tree of inspect() (less hidden nodes; open layers after it, a modal one alone) to the host after each painted frame, only what changed, through zinc:sys device('a11y', lines) while a reader listens (signal a11y 1); a11yactivate, a11yfocus, a11yscroll come back as signals. Android: ZincAccessibility.java, an AccessibilityNodeProvider on SDL's surface (virtual views, ACTION_CLICK, accessibility focus, scroll forward/backward, touch exploration by hover). iOS: ios_a11y.mm, UIAccessibilityElements of a container over SDL's view (a button folds its children; accessibilityActivate, didBecomeFocused, accessibilityScroll). On when VoiceOver/Switch Control run, AccessibilityManager.isEnabled, or a client reads the tree. inspect() now lists a clickable box as button and open layers. Report: docs/reports/zinc-next-a11y-bridges.md (decision text for the coordinator, scored 63 against AccessKit 41 and a view per node 38).

Proofs: AC1 Android emulator Pixel_10 (screen 1080x6000): uiautomator dump == inspect() on the Mac, Home 49 nodes, Forms 71 (tools/a11y-tree, empty diff). AC1 iOS simulator iPhone 17 (xcodebuild test, XCUITest element tree) == inspect() folded as iOS lists it, Home 27, Forms 40. AC2 Android: tests/data/a11y-probe/A11yProbe.java, UiAutomation performAction(ACTION_CLICK) on 'Forms' -> Forms screen, PASS. AC2 iOS: A11yProbeUITests.m, XCUITest tap by label 'Forms' -> TEST SUCCEEDED. T0 tests/t0/ui_a11y_bridge.sh (golden, interpreter = AOT, rebuilt tree == inspect). PASS: ui_a11y_bridge, ui_a11y, ui, rn_showcase, ui_native_view, export_android (golden updated), export_ios, app_library, system_signals, affected_paths.

Cost: no reader: one boolean a frame, nothing sent (emulator, TalkBack off: no device() call). Reader on, 300 nodes scrolled 1 px a frame: AOT 54-60 -> 217-219 us/frame (machine at load 14).

later.md lines (for the coordinator):
- Cross-platform pass / ZN-630: VoiceOver on a real iPhone and TalkBack on a phone: speech, swipe order, double tap, off-screen rows reached in a scroll area (iOS gives them an empty frame), touch exploration through the surface's hover listener.
- ZN-630: macOS NSAccessibility bridge over the same device('a11y') lines (or AccessKit for macOS, Windows, Linux).
- ZN-630: a dirty mark per subtree instead of walking the whole tree each painted frame while a reader listens (160 us a frame for 300 nodes on AOT).
- ZN-630: iOS text fields read as label/value/hint (no public text field trait); try UIAccessibilityTextInput or a hidden UITextField proxy.
- ZN-630: custom actions (onLongPress, aria actions) as UIAccessibilityCustomAction and AccessibilityAction; sliders' increment/decrement.
<!-- SECTION:NOTES:END -->
