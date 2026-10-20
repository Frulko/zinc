---
id: ZN-748
title: >-
  Adaptive platform profile: behaviour and look per platform, kits adaptive by
  default
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-16 20:29'
updated_date: '2026-10-16 23:03'
labels:
  - mobile
  - ui
  - size-M
milestone: m-26
dependencies:
  - ZN-625
ordinal: 199500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16: exploit the most of native in the UI and behaviour the way Flutter does (TargetPlatform defaults, .adaptive widgets, ScrollPhysics) and keep it maintainable (../docs/reports/native-fidelity-and-plugins.md §4.2, ../docs/reports/mobile-native-feel.md). Two layers: behaviour, automatic per platform (scroll physics and overscroll: bounce on iOS/macOS, glow/stretch on Android; page transitions; text selection handles and magnifier; long-press vs right-click context menus; haptics on press where the OS does it; fonts SF / Roboto / system), and look, tokens in lib/std/platform/ that the kits (zinc:ui/kit, nuxt, zinc:react-native) read, adaptive by default with an override per app (zinc.json, ThemeProvider). macOS is a profile too (system font, accent colour, native context menus).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the kit gallery and rn-showcase on android, ios and macos profiles each match a golden per profile (scroll, transition and controls differ as the platform does)
- [x] #2 one switch forces one look everywhere (zinc.json ui.platformLook: "auto" | "ios" | "android" | "neutral")
- [x] #3 docs: what changes per platform and how to override it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-17 by a worktree agent (one commit). docs/ui.md "Platform look" is the user's page; docs/ui-kit.md, docs/nuxt-ui.md, docs/react-native.md point to it.

What each layer does now:
- Behaviour (follows ui.platformStyle(), not themeable): scroll physics (iOS rubber band and 0.998/ms deceleration on iOS, macOS and the desktop; Android spline fling and stretch: zinc-f5's), page transitions (zinc:ui/navigation, zinc-f5's), selection handles (zinc-f5's). New here: the kit ContextMenu opens on a finger's long press on a touch screen (a right click on a desktop; the long press is registered only while the pointer is coarse, so a slow mouse click is never dropped); the haptics the OS's own controls give (iOS: a light impact when a switch flips, kit, nuxt and RN, as Flutter's CupertinoSwitch; a selection tick when a kit Tabs segment moves; a long press: Android impact heavy, iOS impact medium).
- Look (lib/std/platform/tokens.ts, module zinc:ui/platform): IOS, ANDROID (Material 3), MACOS and NEUTRAL tables: button sizes and type, segmented control, type scale, switch and slider geometry, spinner, font families, colours [light, dark] as scheme variables pf* (tint, switch, fill, raised, border, labels). The macOS tint is the user's accent (zinc:sys device('accent') reads AppleAccentColor through CoreFoundation, opened with dlopen as src/tc/bundle.cpp does; not read in deterministic runs). Readers: zinc:ui/kit Button, Switch, Slider, Tabs and typography (platform colours only while the app keeps the kit's own theme); zinc:ui/nuxt Switch shape only (a brand kit); zinc:react-native Switch, Button (React Native's Button.js per platform) and ActivityIndicator (bars, Material's arc).
- Choosing: zinc.json "ui": {"platformLook": "auto" | "ios" | "android" | "macos" | "neutral"} (validated in src/frontend/project.cpp; zinc:platform UI_PLATFORM_LOOK), ZINC_PLATFORM_LOOK for one run, setPlatformLook() or <ThemeProvider look> in code. auto: ios, android, macos on a Mac, neutral elsewhere; a deterministic run on a Mac without ZINC_PLATFORM takes neutral, so its frames are Linux's and every existing golden is unchanged.

Decision (for the coordinator's decision record; RULES §4, max 70): how the kits get a per-platform look.
| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| Token tables in lib/std/platform read by the existing components (the look as data, one component per kind) | 5 | 5 | 4 | 4 | 5 | 5 | 4 | 65 |
| Colours only (a theme per platform, one geometry) | 2 | 5 | 5 | 5 | 5 | 5 | 5 | 61 |
| Two component sets and .adaptive constructors (Flutter's Material and Cupertino) | 4 | 5 | 2 | 2 | 5 | 5 | 1 | 51 |
Chosen: the token tables. Sub-choices: (1) the kits take the platform's geometry, type and font, and the platform's colours only with the kit's built-in theme (an app's theme keeps its colours); Nuxt UI keeps its brand and takes the switch shape (native-fidelity report 4.2); React Native draws as React Native does per platform (Android's Button is RN's #2196f3, not Material's primary). (2) Android is Material 3 (Flutter's _SwitchConfigM3: 52 x 32, thumb 16 and 24, outline 2), not RN's SwitchCompat (Material 2). (3) The tables' text sizes are built at run time (tx(), tw()): the baker bakes every size written in the sources (src/res/res.cpp), and the literal sizes of looks a program does not use changed every RN app's text pixels and grew its blob; kit/typography.ts names the neutral sizes in a comment so kit programs bake as before. (4) Fonts: the families an app ships; SF Pro (SFNS.ttf) and Android 12+'s Roboto are variable fonts that runtime/ttf.cpp cannot instance (no gvar). Revisit when the rasterizer reads variable fonts, or when users ask for Material You colours.

Goldens added: tests/golden/platform-look/hashes.txt: the kit gallery on ios, android and macos (480 x 1300); rn-showcase's components on ios (the neutral light hash: React Native always drew iOS), android and macos; the same screen with a finger pulling past its top (pull.input) on ios (rubber band), android (stretch) and macos. No existing golden changed. Transitions per platform stay proven by tests/t1/navigation.sh.

Tests: PASS platform_look (new, 11 s: the goldens, one compiled hash, the switch forcing kit, nuxt and RN together, the haptics and the long press), ui_kit_sections, rn_showcase, ui, ui_style, ui_theme, ui_docs, scroll_platform, navigation, system_signals, platform_identity, text_touch, rn_idle, react_native, react_native_modal, kit_menubar, ui_press, contrast, ui_layout_option, qjs_demos, rn_port, rn_tester; pixel canary 4 of 4. From a worktree inside the main checkout, zinc also reads the main checkout's plugins/system/plugin.json, whose uncommitted keys print two warnings that fail every output-comparing test (baseline included): run through a wrapper that drops those two lines. nuxt_ui: its navigation light and dark and navsection hashes fail identically at 19b6d5f1 without this change (pre-existing).

Lines for next/backlog/later.md (the coordinator adds them):
- ZN-748: use the OS's UI font at run time (CoreText's UI font file on iOS and macOS, /system/fonts through fonts.xml on Android): SFNS.ttf and Android 12+'s Roboto are variable fonts, so runtime/ttf.cpp needs gvar instancing (or HarfBuzz's hb-draw with variations) first; today a look's font applies only when the app ships the family.
- ZN-748: Android 12+ dynamic colour (system_accent1 through the activity) as the android look's tint, as macOS's accent is; re-read the macOS accent on AppleColorPreferencesChangedNotification (today at the start and on a look change).
- ZN-748: the kit ContextMenu as the native menu on macOS (menu.popup) when menu.native, and iOS's context-menu preview (the lifted item over a blur).
- ZN-748: more controls per look: checkbox (Material 18 px radius 2, macOS 14 px), radio, RefreshControl, Alert (iOS's alert, Material's dialog), the nuxt Checkbox shape.
- ZN-748: check the looks on the Nexus 7 and the iOS simulator (screenshots in docs/reports/zinc-next-android and zinc-next-ios).
<!-- SECTION:NOTES:END -->
