# Android: what makes an app feel native

How a Zinc app is exported, built and installed is in `docs/reports/zinc-next-android.md` (`zinc export --target android`, Gradle, the
Nexus 7 runs). This page is what the app does to behave like an Android app, and how to try it on the desktop. The audit and plan behind it:
`docs/reports/mobile-native-feel.md`.

## Try it on the desktop

`ZINC_PLATFORM=android zinc run .` runs the program as on Android: `platform()` and `Platform.OS` answer `android`, `Platform.select` takes the
`android` branch, `x.android.ts` replaces `x.ts`, and the behaviour below is Android's. `ZINC_PLATFORM_VERSION=29` plays an Android 10
(the scroll glow instead of the stretch). The OS's signals are sent from a `ZINC_INPUT` script (docs/ui.md, "Platform and system signals"):

```
10 safearea 24 0 48 0
10 theme dark
10 fontscale 1.3
20 keyboard 280
40 back
50 backstart left
52 backprogress 0.5
54 back
```

## What the app does

| Area | On Android |
| --- | --- |
| Identity | `platform()` `android`; `Platform.Version` the API level (`ro.build.version.sdk`) |
| Safe area, theme | from SDL (`SDL_GetWindowSafeArea`, `SDL_GetSystemTheme`) at start and when they change |
| Font size, animations off | `Configuration.fontScale` and the animator duration scale 0, sent by the activity (`ZincActivity`) at start, on a configuration change and on resume |
| Keyboard | its height from the IME insets (API 30+) or the visible frame (before), so the focused field is revealed above it; the field's traits choose the keyboard (`ZincEdit.onCreateInputConnection`: input type, return key action, autofill hint) |
| Text input connection | `ZincEdit`, in place of SDL's hidden editor: an `InputConnection` over a mirror of the focused field (text, selection, composing region), so suggestions, autocorrect and composition see the real text |
| Back | the back key (SDL, trapped) and Android 13+'s back callback go to the program's back handlers (`BackHandler`, `ui.addBackHandler`, the navigation stack); none takes it: the task goes to the background (Android 12+'s behaviour for a root activity). Android 14's predictive back gesture sends its progress, and the navigation stack shrinks the screen with it |
| Scrolling | `OverScroller`'s spline fling, the stretch overscroll (12+) or the glow (before), no rubber band, the scrollbars' 300 ms + 250 ms fade |
| Navigation | `zinc:ui/navigation`: Material's shared X axis, the back arrow and a left-aligned title; modal screens as full-screen dialogs |
| Touch selection | a long press selects a word: teardrop handles, a white edit menu, a magnifier while a handle moves, the long-press haptic |
| Status bar | `StatusBar` barStyle (light or dark icons), hidden, backgroundColor (before Android 15, which draws apps edge to edge) |
| Haptics | zinc:haptics and `Vibration`: `View.performHapticFeedback` (CONFIRM, REJECT, SEGMENT_TICK where the API has them); `vibrate` needs the VIBRATE permission, without it a haptic tick |

The Java side is `next/src/app/android/java` (copied into the exported project), the JNI side `next/src/app/android_glue.cpp`.

## Not proven on a device

Written and compiled on the Mac (javac against android-36, clang with NDK r29) without a device in the loop (2026-10-16): the keyboard height,
the input connection with Gboard, swipe typing and a Japanese IME, predictive back, the status bar, haptics and the font scale on a phone are
lines of the cross-platform pass in `next/backlog/later.md`.
