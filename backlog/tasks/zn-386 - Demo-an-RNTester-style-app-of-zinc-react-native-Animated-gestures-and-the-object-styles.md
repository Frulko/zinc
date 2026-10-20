---
id: ZN-386
title: >-
  Demo: an RNTester-style app of zinc:react-native, Animated, gestures and the
  object styles
status: Done
assignee: []
created_date: '2026-10-08 19:49'
updated_date: '2026-10-08 19:56'
labels:
  - ui
  - rn
  - examples
  - size-M
milestone: m-17
dependencies: []
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: demos of everything landed today. examples/rn-tester, written with zinc:react-native in the React model like React Native's own RNTester: a home list of pages, each page one component or API with its props: Pressable and the Touchables, Switch and ActivityIndicator, TextInput and KeyboardAvoidingView, FlatList (10 000 rows, pull to refresh, end reached), SectionList (sticky headers), Animated (timing, spring, decay, interpolate, Animated.event), PanResponder (a draggable card), LayoutAnimation, the object styles (transform array, shadows and elevation, borderStyle, corner radii, side colours, conditional enum values), and Platform / Dimensions / PixelRatio / Appearance with a dark scheme. RN_TESTER_PAGE=<page> opens a page (screenshots, goldens).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 every page renders headless to a recorded frame hash (tests/t1/rn_tester.sh)
- [x] #2 screenshots of every page in examples/rn-tester/screenshots and a README listing them
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: examples/rn-tester (React model, preset react-native): home list and 10 pages (Pressable and Touchables, Switch and ActivityIndicator, TextInput and Keyboard, FlatList 10 000 rows with refresh and end reached and a grid, SectionList sticky, Animated timing / spring / colour interpolation / loop, gestures with PanResponder + Animated.event and a scroll-driven fade, LayoutAnimation, object styles, Platform / Dimensions / PixelRatio / Appearance), light and dark, RN_TESTER_PAGE / RN_TESTER_SCHEME. 14 screenshots and a README; tests/t1/rn_tester.sh holds 14 frame hashes. zinc:react-native gains useAnimated (Animated values re-render a React component) and re-exports LayoutAnimation; the JSX lowering no longer flattens StatusBar's barStyle as a style. tests/run --changed 44/44.
Seen: rotate / skew paint upright (ZN-361.01); a conditional between a colour literal and a number is refused (both branches must be literals).
<!-- SECTION:NOTES:END -->
