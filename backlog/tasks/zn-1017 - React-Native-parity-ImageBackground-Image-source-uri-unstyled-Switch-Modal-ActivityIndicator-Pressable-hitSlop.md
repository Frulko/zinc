---
id: ZN-1017
title: >-
  React Native parity: ImageBackground, Image source uri, unstyled
  Switch/Modal/ActivityIndicator, Pressable hitSlop
status: Backlog
assignee: []
created_date: '2026-11-07 16:35'
labels:
  - react-native
  - ui
  - size-M
milestone: m-17
dependencies: []
ordinal: 1010000
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
- [ ] #1 rn-port screens using these compile unchanged
- [ ] #2 ImageBackground and `source={{uri}}` render in a frame golden
- [ ] #3 hitSlop enlarges the hit area (test)
- [ ] #4 docs/react-native.md lists the parity table
<!-- AC:END -->
