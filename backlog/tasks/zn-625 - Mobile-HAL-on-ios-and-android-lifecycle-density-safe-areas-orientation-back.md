---
id: ZN-625
title: >-
  Mobile HAL on ios and android: lifecycle, density, safe areas, orientation,
  back
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:06'
updated_date: '2026-10-17 01:26'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-622
  - ZN-624
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Background and foreground events in the event watch (stop drawing, save state through an app event), GL context loss, pixel density with a cap, `SDL_GetWindowSafeArea` into `ui.setSafeArea`, rotation as a resize, the Android back button as a key (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a headless test on the desktop drives the new events through `ZINC_INPUT` (`background`, `foreground`, `safe-area t r b l`, `rotate`) with a golden
- [x] #2 on the emulator and simulator rn-showcase survives home and return, and rotation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (owner, native fidelity, ../docs/reports/native-fidelity-and-plugins.md §5 step 2): the host feeds the system's signals on Android, iOS and macOS: theme with "auto" by default (dark mode follows the OS), accent colour, safe area insets and their changes, font scale (Dynamic Type / Android font size), the back button and the iOS back gesture.

2026-10-17 (worktree agent, after zinc-f5's core): proven.
- AC1 (desktop): tests/t0/system_signals.sh runs lifecycle.tsx with lifecycle.input (safe-area 24 0 20 0, background, foreground, rotate, safe-area 0 24 12 24): lifecycle.expected holds the log (AppState background then active, Dimensions 240x180, orientation landscape, the new safe area) and the hashes of frames 2 to 8: frames 3, 4, 5 equal (in the background nothing is drawn, the frame counter stops), frame 8 is 240x180. New script verbs in src/host/hal_dispatch.cpp: background, foreground (signals), safe-area (safearea's spelling), rotate (the headless surface's width and height swap; on a live phone window it asks the OS to turn the screen).
- AC2 (emulator API 37, private AVD; iPhone 17 simulator iOS 26.3, private device, idb 1.7.6 for taps and the home button): rn-showcase survives home and return (same pid, the Phone field's text kept, the picture back on a new surface) and rotation (Android: user_rotation 1 and back, and a script rotate; iOS: a script rotate through requestGeometryUpdate, simctl has no rotation). Screens and logs: docs/reports/zinc-next-android/, zinc-next-ios/, sections 'Lifecycle, safe areas, rotation and the keyboard' of both reports.
- Fixes the runs showed: (1) Android: SDL's pump blocks inside the call that handled the pause (SDL_androidevents.c GetLifecycleEventTimeout reads the global Android_Paused), so the program never heard 'background' before the return. The shell (src/app/shell_sdl.cpp) now runs the program's frames from the WILL_ENTER_BACKGROUND event (at most 8, until the signal is taken) and lets only SDL's loop pump (zn_hal_sdl_no_pump in targets/macos/hal_sdl.cpp, set at start); src/app/app.cpp flushes the program's output after each app frame. (2) Android: SDL's legacy theme painted the status and navigation bars black over the program: ZincActivity draws the bar backgrounds transparent and sets the icons by the theme (dark icons on light); (3) SDL's safe area counted the gesture zones (26 dp on each side in portrait): the export narrows SDLSurface's insets to the bars and the cutout (src/cli_core.cpp). (4) rn-showcase's header and tab bar were under the bars: it pads them with the new useSafeAreaInsets (zinc:react-native, react-native-safe-area-context's hook). (5) zinc:ui ui.appState() and React Native's AppState (currentState, addEventListener('change')) were missing. (6) zinc:sys device('orientation') reaches the phones' glue (screen.orientation.lock): setRequestedOrientation on Android, requestGeometryUpdate on iOS.
- Decision (for the coordinator, no number taken): phones draw edge-to-edge (Android 15's rule, iOS's), the safe area is bars + cutout (not gesture zones), and the program pads (SafeAreaView, useSafeAreaInsets, env(safe-area-inset-*)), as React Native with react-native-safe-area-context. Rejected: the engine insetting the root by itself (Flutter's MaterialApp does it per widget; an RN app expects to draw under the bars, and a kiosk or a game wants the whole screen).
- GL context loss: the default Android renderer is the software raster through ANativeWindow (ZN-743), whose present sets the window buffer up again when the surface comes back; ZINC_RENDERER=gl after a return not tried (later.md line).
<!-- SECTION:NOTES:END -->
