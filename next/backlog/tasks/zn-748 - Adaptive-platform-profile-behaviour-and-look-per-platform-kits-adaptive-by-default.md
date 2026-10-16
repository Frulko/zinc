---
id: ZN-748
title: >-
  Adaptive platform profile: behaviour and look per platform, kits adaptive by
  default
status: Backlog
assignee: []
created_date: '2026-10-16 20:29'
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
- [ ] #1 the kit gallery and rn-showcase on android, ios and macos profiles each match a golden per profile (scroll, transition and controls differ as the platform does)
- [ ] #2 one switch forces one look everywhere (zinc.json ui.platformLook: "auto" | "ios" | "android" | "neutral")
- [ ] #3 docs: what changes per platform and how to override it
<!-- AC:END -->
