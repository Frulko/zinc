# React Native on Zinc

Zinc runs React Native screens written for React Native: `"ui": { "preset": "react-native" }` in `zinc.json` gives React Native's layout (Yoga, the `rn`
engine; `classic` with the same style semantics on targets without Yoga) and resolves React Native's own imports, so `import React, { useState } from
'react'` and `import { View, FlatList } from 'react-native'` compile unchanged. The components and APIs are `zinc:react-native` (`lib/std/react-native.tsx`)
in the React model of `zinc:ui/react`; Animated is `zinc:ui/animated`. Examples: `examples/rn-tester` (every component and API, a page each),
`examples/rn-port` (a React Native screen unchanged), `examples/rn-showcase` (StyleSheet in the Solid model).

## Imports

| React Native writes | Zinc resolves (react-native preset) |
|---|---|
| `import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react'` | `zinc:ui/react` (`React` is a namespace import of it: `React.useEffect` works) |
| `import { View, Text, ... } from 'react-native'` | `zinc:react-native` |
| `Animated`, `Easing` from 'react-native' | `zinc:ui/animated` (`Animated` a namespace) |
| `Linking` from 'react-native' | `zinc:react-native/linking` (needs `"permissions": ["opener", "deep-link"]` and the opener scope in zinc.json) |
| `import type { ... }` from either | dropped |
| an index file with `AppRegistry.registerComponent('main', () => App)` | mounts App |

Without the preset, `'react'` and `'react-native'` stay errors unless a `tsconfig.json` `paths` entry maps them (the prototype's rule). Renaming a host
component (`View as Box`) is not supported: View, Text, Image and ScrollView must keep their names; other components can be aliased.

## Components

| Component | Status | Notes |
|---|---|---|
| View | supported | host element; style, onPress (zinc:ui's), `{...panResponder.panHandlers}` |
| Text | supported | host element; `numberOfLines` (ellipsis); black by default, 16 px (React Native: 14, ZN-385) |
| Image | partial | host element with `src`; `source={{ uri }}`, `resizeMode`, `ImageBackground` missing |
| ScrollView | partial | host element; `onScroll` with `nativeEvent.contentOffset`; `contentContainerStyle`, `horizontal`, `refreshControl` missing |
| Pressable | supported | onPress, onLongPress (500 ms), onPressIn / onPressOut, disabled, accessibilityLabel; `style` as a function of `{ pressed }` and `hitSlop` missing |
| TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback | supported | activeOpacity, underlayColor (replaces the background) |
| Button | supported | title, onPress, color, disabled (iOS's look) |
| Switch | supported | value, onValueChange, trackColor, thumbColor, ios_backgroundColor, disabled (iOS 51 x 31) |
| ActivityIndicator | supported | size small / large, color, animating, hidesWhenStopped |
| TextInput | partial | value, defaultValue, onChangeText, onSubmitEditing, placeholder, keyboardType, secureTextEntry, multiline, editable, maxLength, autoFocus; onFocus / onBlur, placeholderTextColor, returnKeyType, autoCapitalize, selection missing |
| KeyboardAvoidingView | supported | behavior padding / height (both pad) / position, keyboardVerticalOffset, enabled |
| FlatList | partial | virtualised: data, renderItem, keyExtractor (one parameter: ZN-383), ItemSeparatorComponent, ListHeader / Footer / EmptyComponent, numColumns, columnWrapperStyle, getItemLayout, onEndReached + threshold, refreshing / onRefresh; horizontal, inverted, scrollToIndex, onViewableItemsChanged missing |
| SectionList | partial | sections exactly `{ title, data }` (ZN-383), renderItem, renderSectionHeader / Footer, sticky headers, separators, refresh, onEndReached; not virtualised |
| RefreshControl | partial | the spinner row of FlatList / SectionList `refreshing`; the ScrollView `refreshControl` prop is missing |
| Modal | supported | visible, transparent, animationType slide / fade, onRequestClose (Escape), onShow; closes without an exit animation |
| SafeAreaView | supported | a View (no notch on desktop and simulator surfaces) |
| StatusBar | partial | renders nothing (no system status bar); the props are kept |
| VirtualizedList, ImageBackground, DrawerLayoutAndroid, TouchableNativeFeedback, InputAccessoryView | missing | |

## APIs

| API | Status | Notes |
|---|---|---|
| StyleSheet | partial | create (lowered at build time), flatten, compose, hairlineWidth (1 logical px, ZN-385); absoluteFill / absoluteFillObject missing |
| Animated | supported | Value, ValueXY, timing, spring, decay, interpolate (numbers and colours), add / subtract / multiply / divide / modulo, diffClamp, sequence, parallel, stagger, delay, loop, event; in the React model `useAnimated(value)` of zinc:react-native re-renders with the value; useNativeDriver accepted (ZN-364.01) |
| Easing | supported | linear, ease, quad, cubic, poly, sin, circle, exp, elastic, back, bounce, bezier, in / out / inOut |
| LayoutAnimation | supported | configureNext, create, Presets easeInEaseOut / linear / spring |
| PanResponder | partial | create, panHandlers, gestureState dx dy vx vy moveX moveY x0 y0; the should-set callbacks are asked once, when the drag starts |
| Alert | partial | alert(title, message, buttons) as an in-app dialog (cancel, destructive); prompt missing |
| Linking | supported | openURL, canOpenURL, getInitialURL, addEventListener('url'), openSettings (zinc:react-native/linking) |
| Keyboard | supported | addListener keyboardDid/WillShow, Hide, ChangeFrame; dismiss, isVisible, metrics |
| Platform | partial | OS (zinc's platform names: macos, linux, web, device targets), Version, select (with a fallback argument: no undefined result) |
| Dimensions, useWindowDimensions | supported | get('window' / 'screen'), change events |
| PixelRatio | supported | get, getFontScale (1), getPixelSizeForLayoutSize, roundToNearestPixel |
| Appearance, useColorScheme | partial | ZINC_COLOR_SCHEME or setColorScheme; the system setting is not read yet |
| AppRegistry | partial | registerComponent mounts the app; runApplication missing |
| processColor | partial | #rgb, #rrggbb, #rrggbbaa (alpha dropped), white, black, transparent |
| I18nManager | partial | isRTL, forceRTL (at once, for the whole surface), allowRTL |
| AccessibilityInfo, AppState, BackHandler, InteractionManager, PlatformColor, Share, Vibration, ToastAndroid | missing | |

## Styles

React Native's object style keys: flex (grow, shrink 1, basis 0 under the preset), flexGrow / Shrink / Basis, flexDirection, flexWrap, justifyContent,
alignItems / Self / Content (baseline: Yoga, flex-end in classic), position and insets, width / height (numbers, `'50%'`, `` `${n}%` ``), min / max sizes,
aspectRatio, margin / padding (sides, horizontal / vertical), gap, display, overflow, opacity, backgroundColor, color, border widths, colours (sides),
radii (corners), borderStyle, shadowColor / Offset / Opacity / Radius, elevation, the transform array (translate, scale, scaleX / Y, rotate, skew: rotate
and skew hit-test now and paint with ZN-361.01), fontSize, fontWeight, lineHeight, letterSpacing, textAlign, numberOfLines. Values chosen at run time:
numbers, and conditionals between literals for the keys that take strings (`fontWeight: on ? 'bold' : 'normal'`). Missing: fontStyle italic as a key,
textDecorationLine, textTransform, direction, zIndex as an object key, backfaceVisibility, tintColor (docs/ui.md lists the keys).
