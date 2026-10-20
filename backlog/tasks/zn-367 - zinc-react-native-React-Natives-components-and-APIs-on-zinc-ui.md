---
id: ZN-367
title: 'zinc:react-native: React Native''s components and APIs on zinc:ui'
status: Done
assignee: []
created_date: '2026-10-08 15:16'
updated_date: '2026-10-08 21:09'
labels:
  - ui
  - rn
  - size-L
milestone: m-17
dependencies:
  - ZN-367.02
  - ZN-367.03
  - ZN-367.04
  - ZN-367.05
ordinal: 50090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: the same syntax as React Native. The capitalised host names already compile (View, Text, Image, ScrollView, Button, Canvas, Input, TextArea: src/frontend/jsx.cpp). Add a module `zinc:react-native` with the rest, mapped on zinc:ui: Pressable and the Touchable* family (onPress, onLongPress, pressed state, hitSlop), TextInput (value, onChangeText, keyboardType, secureTextEntry, multiline, placeholder), FlatList / SectionList (virtualised, keyExtractor, renderItem, ListHeader/Footer, onEndReached, pull to refresh), Switch, Modal, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, StatusBar, and the APIs Platform, Dimensions, useWindowDimensions, Appearance / useColorScheme, PixelRatio, Linking, Alert, Keyboard. Prop names and defaults follow React Native; what cannot map is listed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a React Native screen written for RN (imports from 'react-native' rewritten to 'zinc:react-native') runs unchanged in the rn layout mode (the RN example port spike ZN-290 uses it)
- [x] #2 each component has a test of its main props and events
- [x] #3 docs/react-native.md lists every component and API with supported, partial or missing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-367.01..05: zinc:react-native (components, APIs, Linking module, import aliases), tests per component, docs/react-native.md, examples/rn-port runs a React Native screen unchanged, examples/rn-tester shows every component.
<!-- SECTION:NOTES:END -->
