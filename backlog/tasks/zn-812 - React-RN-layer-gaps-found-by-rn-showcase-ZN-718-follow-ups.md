---
id: ZN-812
title: React/RN layer gaps found by rn-showcase (ZN-718 follow-ups)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:56'
updated_date: '2026-11-08 23:01'
labels:
  - size-M
milestone: m-5
dependencies: []
ordinal: 6400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Keep AC2 (host tag shadowing, ActivityIndicator), AC3 (View props), AC4 (DevTools names); drop AC1.

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
- [x] #1 useEffect cleanup (returned function) runs on re-run and unmount (lib/std/react.ts never sets EffectHook.cleanup)
- [x] #2 A local component named like a host tag shadows it; `<ActivityIndicator />` with no props and a run-time `rotate` compile
- [x] #3 View accepts pointerEvents and accessibilityLabel, TextInput placeholderTextColor; ui.onScroll drops dead watchers
- [x] #4 DevTools DOM view shows <View className> names; inspector tests updated; one T1 test covers the set
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. useEffect cleanup now exists (lib/std/react.ts:127-139); left AC2-AC4. Evidence: lib/std/react.ts:127

Research (sonnet, 2026-11-09): RN pointerEvents 'auto' | 'none' | 'box-none' (the view never the target, its children can be) | 'box-only' (the view, not its children) (https://blog.logrocket.com/using-pointerevents-react-native/); react-native-web maps accessibilityLabel to aria-label (https://necolas.github.io/react-native-web/docs/accessibility); CDP DOM.Node nodeName/localName (https://chromium.googlesource.com/devtools/devtools-frontend/+/main/node_modules/devtools-protocol/pdl/domains/DOM.pdl): Chrome's nodeNameInCorrectCase shows localName when it has nodeName's length, nodeName as given when localName is empty.

Work 2026-11-09:
- AC1 already on develop (react.ts runs the cleanup before a re-run and at unmount).
- AC2: a file's own function Button already shadowed the host (a component, tag FRAGMENT, not BUTTON); <ActivityIndicator /> with no props already compiled. New: transform rotate/skewX/skewY with a run-time value goes through ui.angle(v: unknown) (a number of degrees, or '30deg' / '0.5rad' / '0.25turn'), imported as __ZAngle by the JSX lowering.
- AC3: accessibilityLabel and placeholderTextColor (string colour, as RN) were already there. New: pointerEvents as a View prop (literal or conditional between literals), with box-none and box-only; UiNode.noPointer (bool) became UiNode.ptr (0 auto, 1 none, 2 box-none, 3 box-only) read by hitIn. ui.onScroll already dropped the watchers of freed nodes; the leak found was the onScroll attribute stacking one watcher per render (fired 10 times for one scroll after 9 renders): ui.onScroll(h, f, prop=true) from the JSX helpers replaces the attribute's watcher.
- AC4: zinc:devtools names host nodes as JSX (View, Text, ScrollView, Input, TextArea...), nodeName = localName; a component's wrapper keeps nodeName and gets an empty localName (Chrome shows it as written, the inspector tells it from a host node of the same name); the class attribute is className (attrs, DOM.setAttributeValue, attributeModified, setAttributesAsText). Updated: app/inspector/elements.tsx, tests/t1/inspector_pause.sh, scripts/cdp-check.mjs, tools/cdp-probe, tests/golden/host/devtools.tsx (its golden output unchanged). Decision: the set is covered by a T0 test (tests/t0/rn_layer_gaps.sh, seconds long, not a T1): it runs in under 2 s and needs no window; the DevTools names are covered by the updated inspector tests.
Proven on interpreter, --engine quickjs and --native with the T0 program; DevTools names with tests/golden/host/devtools.tsx on a free port.

later.md lines: - ZN-812: `import { Canvas } from 'zinc:canvas'` with `<Canvas onDraw>` still gives a type error; say the name is the host Canvas and name the alias to use (dropped from this task's criteria by the review). - ZN-812: the inspector's own render of a user component named like a host tag is fine now (empty localName), but layoutcheck.ts and the scene dump still use the lowercase TAG_NAMES.

Proposed tests: tests/run --only inspector,inspector_pause,inspector_stage (T1, the Elements names and className edits; ~1-2 min, ~500 MB, windowed/ports: alone); tests/run --only host (the devtools golden, a port); node scripts/cdp-check.mjs against a running zinc dev; tests/run --only ui_tokens (the noPointer -> ptr probe; golden output unchanged).
<!-- SECTION:NOTES:END -->
