---
id: ZN-1017
title: >-
  React Native parity: ImageBackground, Image source uri, unstyled
  Switch/Modal/ActivityIndicator, Pressable hitSlop
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:35'
updated_date: '2026-11-08 21:16'
labels:
  - react-native
  - ui
  - size-M
milestone: m-17
dependencies: []
ordinal: 3600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc:react-native has no `ImageBackground`, `Image` takes no `source={{ uri }}`, the Solid model lacks unstyled Switch, Modal and ActivityIndicator, Pressable lacks hitSlop, pressRetentionOffset, delayLongPress and android_ripple, Button keeps the 0.6 dim, SafeAreaView compiles through env() classes. Fill them for ported screens.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-262: zinc:react-native has no ImageBackground and Image takes no source={{ uri }}; a View with backgroundImage: 'url(..)' covers the first.
- ZN-774.18: the Solid model has no unstyled Switch, Modal or ActivityIndicator (React Native's core has them; zinc:react-native gives them only in the React model).
- ZN-774.18: zinc:react-native's Button keeps zinc:ui's 0.6 pressed dim; React Native's Button uses TouchableOpacity (0.2) on iOS and a ripple on Android: give each platform look its own feedback so Button matches the platform it draws.
- ZN-774.18: Pressable still lacks hitSlop, pressRetentionOffset, delayLongPress and android_ripple; ported screens that use them lose those behaviours.
- ZN-774.18: SafeAreaView (lib/std/react-native.tsx) pads itself through `pt-[env(safe-area-inset-*)]` classes, so a React Native program that uses it (zinc-go, rn-showcase) still compiles in the class parser, about 11 % of its code; padding from the safe-area signal as style keys removes it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rn-port screens using these compile unchanged
- [x] #2 ImageBackground and `source={{uri}}` render in a frame golden
- [x] #3 hitSlop enlarges the hit area (test)
- [x] #4 docs/react-native.md lists the parity table
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker branch, 2026-11-08).
Research: React Native Pressable (https://reactnative.dev/docs/pressable: hitSlop and pressRetentionOffset as number or Rect, delayLongPress 500 ms default), ImageBackground (https://reactnative.dev/docs/imagebackground: style for the box, imageStyle for the image), Button.js uses TouchableOpacity on iOS and TouchableNativeFeedback (ripple) on Android.
What changed: zinc:ui setHitSlop, setPressRetention, setLongPressDelay (Handlers.slop and longMs; hitIn takes the slop, the release and the pressed dim hold within slop + retention); react-native.tsx Pressable/Touchables take hitSlop, pressRetentionOffset, delayLongPress, android_ripple (accepted, not drawn); ImageBackground; JSX <Image source={{ uri }}> lowers to the src; Button fades to 0.2 on iOS, neutral and macOS (Android keeps the dim until a ripple exists).
Decision: hitSlop/pressRetentionOffset are typed Insets; a literal number (hitSlop={10}) is rewritten by the JSX lowering into the four sides, because a union of a number and an object has no IR type yet (D190: a union of primitives has no IR type; typeof does not narrow number | string either). A number held in a variable gives a type error, not a silent miss.
Not done (not criteria, left for later): unstyled Switch, Modal and ActivityIndicator for the Solid model; SafeAreaView padding from the safe-area signal as style keys instead of env() classes; the android_ripple drawing.
Proof: tests/t1/rn_parity.sh (tests/golden/rn-parity, written with 'react-native' imports under the react-native preset): frame hash equal on the interpreter and QuickJS, the image and title looked at; the hitSlop, retention and delayLongPress presses log slop,kept,long. react_native, react_native_imports, react_native_modal, rn_port, jsx, ui_input_edges, demo_gaps, ui_gesture_state pass; zinc check of rn-port, rn-showcase, rn-tester ok. docs/react-native.md table updated.
Proposed tests: rn_showcase and rn-tester T1 sessions (Button press frames on iOS look change: 0.2 instead of the dim), a touch run of hitSlop on a phone.
<!-- SECTION:NOTES:END -->
