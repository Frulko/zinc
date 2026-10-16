# iOS: what makes an app feel native

The iOS profiles (`ios`, `ios-sim`) and the app library are described in `docs/reports/zinc-next-mobile-core.md`; an iOS export is not made
yet. This page is what the app does to behave like an iOS app, and how to try it on the desktop. The audit and plan behind it:
`docs/reports/mobile-native-feel.md`.

## Try it on the desktop

`ZINC_PLATFORM=ios zinc run .` runs the program as on iOS: `platform()` and `Platform.OS` answer `ios`, `Platform.select` takes the `ios`
branch, `x.ios.ts` replaces `x.ts`, and the behaviour below is iOS's (the desktop's own is iOS's too, without the platform's identity). The OS's
signals come from a `ZINC_INPUT` script: `safearea 47 0 34 0`, `theme dark`, `fontscale 1.24`, `reducemotion 1`, `keyboard 336`.

## What the app does

| Area | On iOS |
| --- | --- |
| Identity | `platform()` `ios`; `Platform.Version` the iOS version (`kern.osproductversion`) |
| Safe area, theme | from SDL (`SDL_GetWindowSafeArea`, `SDL_GetSystemTheme`) at start and when they change |
| Dynamic Type, Reduce Motion | the content size category as a scale (Large 1.0, up to 3.12 for the largest accessibility size) and Reduce Motion, at start and on their notifications (`src/app/ios_glue.mm`) |
| Keyboard | its height from `UIKeyboardWillChangeFrameNotification`, so the focused field is revealed above it; the field's traits set the keyboard type, return key, capitalisation, autocorrection, secure entry and content type |
| Text input connection | `ZincTextInput`, a `UITextInput` view that mirrors the focused field (text, selection, marked text) in place of SDL's hidden text field |
| Scrolling | UIScrollView's deceleration (0.998/ms) and rubber band (the desktop's too) |
| Navigation | `zinc:ui/navigation`: the slide with parallax and dimming, the interactive edge swipe back (completed or cancelled by the release velocity), the chevron with the previous title, the large title; modal screens as sheets dismissed by a drag |
| Touch selection | a long press selects a word: bar handles with a knob, the dark edit menu, a magnifier while a handle moves, a selection haptic |
| Status bar | `StatusBar` barStyle and hidden (through `UIApplication`: the app's Info.plist sets `UIViewControllerBasedStatusBarAppearance` to NO) |
| Haptics | zinc:haptics: `UIImpactFeedbackGenerator`, `UISelectionFeedbackGenerator`, `UINotificationFeedbackGenerator`; `Vibration` plays a heavy impact |

## Not proven on a device

`src/app/ios_glue.mm` compiles against the iOS simulator SDK but has run on neither the simulator nor a phone (2026-10-16): the text input
connection (suggestions, the Japanese and Chinese IMEs, dictation, a password manager), the keyboard height, Dynamic Type, haptics and the
status bar are lines of the cross-platform pass in `next/backlog/later.md`.
