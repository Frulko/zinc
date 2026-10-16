# React Native on Zinc

Zinc runs React Native screens written for React Native: `"ui": { "preset": "react-native" }` in `zinc.json` gives React Native's layout (Yoga, the `rn`
engine; `classic` with the same style semantics on targets without Yoga) and resolves React Native's own imports, so `import React, { useState } from
'react'` and `import { View, FlatList } from 'react-native'` compile unchanged. The components and APIs are `zinc:react-native` (`lib/std/react-native.tsx`)
in the React model of `zinc:ui/react`; Animated is `zinc:ui/animated`. Examples: `examples/rn-tester` (every component and API, a page each),
`examples/rn-port` (a React Native screen unchanged), `examples/rn-showcase` (a kitchen-sink app in the React model: tabs and a stack, forms,
network with a mock mode, media, camera, motion, storage, platform APIs, platform-specific files).

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
| Text | supported | host element; `numberOfLines` (ellipsis); black by default, 14 px under the preset (16 px without it); the face is Inter, or the app's own: an `assets/Roboto*.ttf` (Apache-2.0) and `ui.setFontSans('Roboto')` come closer to Android's, San Francisco cannot be shipped |
| Image | partial | host element with `src`; `resizeMode` (attribute or style: cover, contain, stretch, center, repeat) and `tintColor` (a multiply: exact on white and grey pixels); `source={{ uri }}` and `ImageBackground` missing (a View takes `backgroundImage: 'url(..)'`) |
| ScrollView | partial | host element; `onScroll` with `nativeEvent.contentOffset`; `contentContainerStyle`, `horizontal`, `refreshControl` missing |
| Pressable | supported | onPress, onLongPress (500 ms), onPressIn / onPressOut, disabled, accessibilityLabel; dims to 0.6 while pressed (zinc:ui's pressed feedback; React Native shows nothing); `style` as a function of `{ pressed }` and `hitSlop` missing |
| TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback | supported | activeOpacity, underlayColor (replaces the background); their own feedback replaces the default dim, TouchableWithoutFeedback shows none |
| Button | supported | title, onPress, color, disabled (iOS's look) |
| Switch | supported | value, onValueChange, trackColor, thumbColor, ios_backgroundColor, disabled (iOS 51 x 31) |
| ActivityIndicator | supported | size small / large, color, animating, hidesWhenStopped |
| TextInput | partial | value, defaultValue, onChangeText, onSubmitEditing, placeholder, keyboardType, secureTextEntry, multiline, editable, maxLength, autoFocus; autoCapitalize, autoCorrect, returnKeyType, textContentType, autoComplete reach the phone's keyboard; onFocus / onBlur, placeholderTextColor, selection missing |
| KeyboardAvoidingView | supported | behavior padding / height (both pad) / position, keyboardVerticalOffset, enabled |
| FlatList | partial | virtualised: data, renderItem, keyExtractor (item, index), ItemSeparatorComponent, ListHeader / Footer / EmptyComponent, numColumns, columnWrapperStyle, getItemLayout, onEndReached + threshold, refreshing / onRefresh; horizontal, inverted, scrollToIndex, onViewableItemsChanged missing |
| SectionList | partial | sections exactly `{ title, data }` (a declared array of sections cannot widen to optional members yet: ZN-389), renderItem, renderSectionHeader / Footer, sticky headers, separators, refresh, onEndReached; not virtualised |
| RefreshControl | partial | the spinner row of FlatList / SectionList `refreshing`; the ScrollView `refreshControl` prop is missing |
| Modal | supported | visible, transparent, animationType slide (the content comes up in 250 ms; the dimmed full-size view of a transparent modal fades in place, as on iOS) / fade (200 ms) / none, onRequestClose (Escape), onShow; closing plays the motion backwards |
| SafeAreaView | supported | pads its content by the system's safe area (notch, status bar, home indicator), which the OS feeds to zinc:ui; 0 on a desktop |
| StatusBar | partial | barStyle, hidden, backgroundColor (Android before 15) go to the phone's system bar; `setStatusBarStyle`, `setStatusBarHidden`, `setStatusBarBackgroundColor`, `setStatusBarTranslucent` stand for the statics; renders nothing |
| VirtualizedList, ImageBackground, DrawerLayoutAndroid, TouchableNativeFeedback, InputAccessoryView | missing | |

## APIs

| API | Status | Notes |
|---|---|---|
| StyleSheet | partial | create (lowered at build time), flatten, compose, hairlineWidth (0.4 rounded to the device pixel, else one device pixel: 0.5 at scale 2, as React Native; a hairline-high box keeps a pixel of layout); absoluteFill / absoluteFillObject missing |
| Animated | supported | Value, ValueXY, timing, spring, decay, interpolate (numbers and colours), add / subtract / multiply / divide / modulo, diffClamp, sequence, parallel, stagger, delay, loop, event; in the React model `useAnimated(value)` of zinc:react-native re-renders with the value; useNativeDriver accepted (ZN-364.01) |
| Easing | supported | linear, ease, quad, cubic, poly, sin, circle, exp, elastic, back, bounce, bezier, in / out / inOut |
| LayoutAnimation | supported | configureNext, create, Presets easeInEaseOut / linear / spring |
| PanResponder | partial | create, panHandlers, gestureState dx dy vx vy moveX moveY x0 y0; the should-set callbacks are asked once, when the drag starts |
| Alert | partial | alert(title, message, buttons) as an in-app dialog (cancel, destructive) that fades in and out; prompt missing |
| Linking | supported | openURL, canOpenURL, getInitialURL, addEventListener('url'), openSettings (zinc:react-native/linking) |
| Keyboard | supported | addListener keyboardDid/WillShow, Hide, ChangeFrame; dismiss, isVisible, metrics |
| Platform | partial | OS (`android`, `ios`, `macos`, `linux`, `web`), Version (a string: Android's API level, the iOS version), select with `ios`, `android`, `native`, `default` (and a fallback argument: no undefined result); `ZINC_PLATFORM=android\|ios` runs a phone's branch on the desktop; isPad, isTV false |
| Dimensions, useWindowDimensions | supported | get('window' / 'screen'), change events |
| PixelRatio | supported | get, getFontScale (the OS's text size: Android's font size, iOS's Dynamic Type; Text sizes follow it), getPixelSizeForLayoutSize, roundToNearestPixel |
| Appearance, useColorScheme | supported | the system's light or dark and its changes (Android, iOS, macOS); ZINC_COLOR_SCHEME or setColorScheme override it ('unspecified' follows the system again) |
| AppRegistry | partial | registerComponent mounts the app; runApplication missing |
| processColor | partial | #rgb, #rrggbb, #rrggbbaa (alpha dropped), white, black, transparent |
| I18nManager | partial | isRTL, forceRTL (at once, for the whole surface), allowRTL |
| Navigation (React Navigation's native stack) | partial | not React Navigation's API: `Stack` of zinc:ui/navigation (push, pop, replace, popToTop, present) with each platform's transitions, iOS's swipe back and Android's back and predictive back (docs/ui.md, "Navigation stack") |
| BackHandler | supported | addEventListener('hardwareBackPress') (the newest listener that returns true takes it; none: the app goes back to the system), exitApp; the back key and the predictive back gesture on Android |
| Vibration | partial | vibrate(ms), cancel; a pattern plays its first pulse. Touch feedback: `Haptics.impact / selection / notification` of zinc:haptics |
| AccessibilityInfo, AppState, InteractionManager, PlatformColor, Share, ToastAndroid | missing | |

## Platform-specific files

As Metro does, an import of `./Screen` picks the file of the platform being built, so a program carries code for one platform without an `if`:
the other platforms' files are not compiled in.

| Built for | `./Screen` is the first that exists |
|---|---|
| Android (`--profile android`, `zinc export --target android`) | `Screen.android.ts`, `Screen.native.ts`, `Screen.ts`, then the same with `.tsx` |
| iOS (`--profile ios`, `ios-sim`, `zinc export --target ios`) | `Screen.ios.*`, `Screen.native.*`, `Screen.*` |
| webOS (`zinc build --target webos`), macOS, Linux, Windows, a board (`--profile esp32`) | `Screen.<platform>.*`, `Screen.native.*`, `Screen.*` (with no profile, `zinc run` takes this machine's: `Screen.macos.tsx`) |
| the web (`--profile wasm`) | `Screen.wasm.*`, `Screen.web.*`, `Screen.*` (no `.native`) |

The suffix sits before the extension and each extension is tried in turn (`.ts` before `.tsx`), the rule of Metro and of TypeScript's
`moduleSuffixes`; index files (`./screens` is `screens/index.android.tsx`) and `tsconfig.json` `paths` follow it too. `ZINC_PLATFORM=android|ios|webos|...`
picks a platform's files on the desktop. A platform file can wrap the plain one: `Screen.native.tsx` may import `./Screen`, which then is `Screen.tsx`.

```text
src/Screen.tsx          export const Screen = () => <Text>web</Text>;
src/Screen.native.tsx   export const Screen = () => <Text>phones and desktops</Text>;
src/Screen.android.tsx  export const Screen = () => <Text>Android</Text>;
src/App.tsx             import { Screen } from './Screen';
```

`zinc new`, `zinc init` and `zinc tsconfig` write `"moduleSuffixes": [".macos", ".native", ""]` (this machine's platform) in `tsconfig.json`, so tsc
and the editor resolve the file `zinc run` takes; `zinc lsp` follows the `moduleSuffixes` it finds there (set `[".android", ".native", ""]` to
browse the Android files). `Platform.OS` and `Platform.select` choose at run time inside one file.

## Styles

React Native's object style keys: flex (grow, shrink 1, basis 0 under the preset), flexGrow / Shrink / Basis, flexDirection (reverse too), flexWrap (wrap-reverse too), justifyContent,
alignItems / Self / Content (baseline: Yoga, flex-end in classic), position (relative by default, static, absolute) and insets (percent too in rn: padding, margin, insets, gaps, min / max), width / height (numbers, `'50%'`, `` `${n}%` ``), min / max sizes,
aspectRatio, margin / padding (sides, horizontal / vertical, margins `'auto'`), gap, rowGap, columnGap, display, overflow, opacity, backgroundColor, color, border widths (they take layout space in the rn engine, paint only in classic: ZN-388), boxSizing, colours (sides),
radii (corners), borderStyle, backgroundImage (`url(..)` or a gradient) with backgroundSize / Position / Repeat, resizeMode, objectFit, objectPosition, tintColor, shadowColor / Offset / Opacity / Radius, elevation, the transform array (translate, scale, scaleX / Y, rotate, skew: rotate
and skew hit-test now and paint with ZN-361.01), fontSize, fontWeight, lineHeight, letterSpacing, textAlign, numberOfLines. Values chosen at run time:
numbers, and conditionals between literals for the keys that take strings (`fontWeight: on ? 'bold' : 'normal'`). Missing: fontStyle italic as a key,
textDecorationLine, textTransform, direction, zIndex as an object key, backfaceVisibility (docs/ui.md lists the keys).
