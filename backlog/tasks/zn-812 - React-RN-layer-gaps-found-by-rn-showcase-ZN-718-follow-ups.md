---
id: ZN-812
title: React/RN layer gaps found by rn-showcase (ZN-718 follow-ups)
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-M
milestone: m-5
dependencies: []
ordinal: 3100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-718: JSX: let a declaration of the same name in the file shadow the host element as React does (today only an import does: studio kit.tsx declares a `Button` component and still uses the host `<Button>` inside it).
- ZN-718: JSX: `import { Canvas } from 'zinc:canvas'` plus `<Canvas onDraw>` gives a type error: say that the name is the host Canvas and name the alias to use.
- ZN-718: DevTools: the DOM view still shows `<view class="...">` as node names; show `<View className>` as React DevTools does (the inspector tests expect the old names).
- ZN-718: FlatList / `ui.virtualize` at rest still allocates 2 objects per frame on the interpreter (not the for-of loops of ui.ts); the Data, Network and Media screens of rn-showcase are left out of the idle check because of it.
- ZN-718: `useEffect` cleanup (a returned function) is ignored in zinc:ui/react (`EffectHook.cleanup` is never set): the listeners of useColorScheme, useAnimated and Dimensions outlive their component (rn-showcase works around it with `onLeave`).
- ZN-718: `<ActivityIndicator />` with no attributes is error Z0104: a component whose props are all optional should accept zero attributes.
- ZN-718: `transform: [{ rotate }]` takes only a literal string; a run-time angle is error Z0103.
- ZN-718: zinc:react-native: View lacks `pointerEvents` and `accessibilityLabel` (only `aria-label` works); TextInput has no `placeholderTextColor` (low-contrast placeholders in dark mode).
- ZN-718: `ui.onScroll` never drops the watchers of dead nodes: FlatLists that mount and unmount leak entries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 useEffect cleanup (returned function) runs on re-run and unmount (lib/std/react.ts never sets EffectHook.cleanup)
- [ ] #2 A local component named like a host tag shadows it; `<ActivityIndicator />` with no props and a run-time `rotate` compile
- [ ] #3 View accepts pointerEvents and accessibilityLabel, TextInput placeholderTextColor; ui.onScroll drops dead watchers
- [ ] #4 DevTools DOM view shows <View className> names; inspector tests updated; one T1 test covers the set
<!-- AC:END -->
