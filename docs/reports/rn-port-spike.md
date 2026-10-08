# React Native port spike (ZN-290, LE-11)

`examples/rn-port` is a React Native screen written the way React Native developers write it (TypeScript, `StyleSheet.create`, a default-exported function
component without a return type, `useState('')`, destructured props, `FlatList` with `keyExtractor` and `ItemSeparatorComponent`, nested flex, percent
widths from `` `${n}%` ``, an absolutely positioned badge, `numberOfLines`, `alignItems: 'baseline'`, `StyleSheet.hairlineWidth`, a controlled
`TextInput`, a `Pressable`) and an `index.tsx` entry. Only its two import lines differ from the React Native original (the aliases are ZN-367.05). It runs in
the `react-native` preset (Yoga) at 390 x 844 (an iPhone 14): `tests/t1/rn_port.sh` holds its frame hash and its layout facts (`tests/golden/rn-port`),
the screenshot is `examples/rn-port/screenshot.png`.

## Reference

No device or simulator runs React Native here (no hardware, no Xcode iOS simulator in the loop). The layout reference is Yoga itself, React Native's
engine, which zinc:ui's rn mode runs (ZN-289: 227 of 227 expressible conformance cases); the paint reference is React Native's documented iOS defaults.
The facts checked: the separator inset at x = 76 (marginLeft), the badge at the avatar's bottom-right corner (absolute right / bottom 0), the bio cut to two
lines with an ellipsis, the progress bar at 80% of its track (238 of 298 px), a TextInput without a border, and the search filter (typing "ra" leaves 2).

## What had to change in Zinc (fixed in ZN-290)

| Gap | Fix |
|---|---|
| `zinc run .` ignored `zinc.json` "entry" (the project directory compared with a trailing slash) | `fs::equivalent` in main.cpp; an `index.tsx` entry works |
| `<Text numberOfLines>` unknown | the numberOfLines property (line clamp with an ellipsis) |
| `alignItems: 'baseline'` refused | the enum value: real baselines in Yoga, flex-end in classic (ZN-382 for real baselines there) |
| `StyleSheet.hairlineWidth` missing | 1 logical px (ZN-385 for 1 / PixelRatio) |
| `` width: `${n}%` `` refused (a string) | lowered to the run-time percent, like `pct(n)` |
| `keyExtractor={(c) => c.id}` refused (one parameter against two) | keyExtractor takes one parameter until ZN-383 (contextual typing of generic arguments) |
| TextInput drew zinc:ui's field border | zinc:react-native's TextInput has no border of its own |

## Differences from a React Native device that remain

| Difference | Task |
|---|---|
| The imports must name `zinc:ui/react` and `zinc:react-native` | ZN-367.05 (aliases for 'react' and 'react-native') |
| Inter instead of San Francisco: glyph widths and line heights differ, so wrapping points can move by a word | ZN-385 |
| Text without a fontSize is 16 px (React Native: 14) | ZN-385 |
| hairlineWidth is 1 logical px (iPhone: 1/3) | ZN-385 |
| Baseline alignment in classic is approximated by flex-end | ZN-382 |
| A generic list prop's lambda must match its arity; sections must be exactly { title, data } | ZN-383 |
| No device screenshot to diff pixel by pixel | a real-device run is a board task (RULES section 2, parked) |
