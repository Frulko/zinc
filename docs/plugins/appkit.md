# zinc:appkit — the zinc:ui tree as real AppKit views (macOS)

`plugins/appkit` is the macOS native host of zinc:ui (decision D210, `docs/reports/appkit-native-ui-research.md`). The program keeps writing
zinc:ui, Solid, React or React Native code; under `"ui": { "render": "native" }` in `zinc.json` (or `ZINC_RENDER=native` for one run) the tree shows
as AppKit views instead of being drawn, the way React Native for macOS mounts its host components.

```json
{ "ui": { "render": "native" } }
```

```tsx
import 'zinc:appkit';   // installs the host; nothing else changes in the program
```

| target | status |
|---|---|
| macos | AppKit views over the SDL window's view (`native/appkit.macos.mm`, ARC); headless runs use a window that is never shown |
| everything else | the stand-in: no host starts, the program is drawn as before |

## What becomes what

| zinc:ui | AppKit | Notes |
|---|---|---|
| `View`, `Pressable`, `Button` | a flipped NSView that draws its background, radius and border | none at all when it has no background, border, opacity or hiding: its children hang on the nearest real view (view flattening) |
| `Text` | a wrapping NSTextField label | system font at the node's size and weight; `labelColor` unless the text or an ancestor sets a colour |
| `Image` | NSImageView | the asset of `setImage` (the project's `assets/`), scaled to fit |
| `ScrollView` | NSScrollView with a flipped document | native scrolling and elastic edges; the offset comes back as `onScroll` |
| `TextInput` | NSTextField, NSSecureTextField for a password | placeholder, value, focus, Enter |
| `TextArea` | NSTextView in an NSScrollView | |
| `Canvas` | an empty view for now | drawn islands come with ZN-1071 and on |

The layout stays zinc:ui's: a native render lays out with Yoga (the `rn` layout) unless `ui.layout` says otherwise, and AppKit measures the text
and field leaves with the same cells that show them. The root follows the window's size and draws `windowBackgroundColor`; colours a program
writes (`bg-[#ff0000]`) stay as written, and the system colours follow the light or dark appearance live. `ZINC_APPEARANCE=dark` or `light` forces
one for a run (screenshots).

## Events

Presses, hover and drags are not taken by the views: they go through to SDL's view, and zinc:ui hit-tests its own tree with the same boxes, so
`onClick`, `onPress`, the pressed look and gestures work as in the drawn UI. The views that take input themselves report through the functions the
web's DOM host uses: typing (`ui.domEdit`, so `onInput` and `onChangeText`), the end of editing (`onChange`), Enter (`onSubmit`), focus and blur,
scrolling (`ui.domScroll`, so `onScroll` and virtual lists). Each event carries the handle and the generation its view was made under: an event
of a view deleted since, or of a handle that holds another node now, is dropped. Keys pressed in a native field reach only the program's key
handlers (`onKeyDown`, `onKey`, the keymap); the field does the editing.

## Tests

```ts
import * as appkit from 'zinc:appkit';
appkit.dump();             // the native tree: one view per line, `#ID kind x,y wxh` then its text, colours, content size
appkit.hit(x, y);          // the node AppKit's hit test picks there, -1 when a press goes through to zinc:ui
appkit.drive(h, 0, 'hi');  // types into field h through its field editor; 1: Enter; 2: scrolls scroll view h to (x, y)
appkit.snapshot('a.png');  // what the views show, drawn offscreen (for people: it changes with each macOS)
```

`tests/t0/ui_appkit.sh` runs `tests/golden/ui-appkit` headless on the interpreter (against its golden), QuickJS and the AOT.

## Not yet

Window chrome, toolbars and split views (ZN-1071), tables and outlines (ZN-1072), controls, popovers and sheets (ZN-1073); text spans with their
own styles (a `Text`'s string shows in one style), shadows and clipping, a scroll position set by the program, more windows than the main one.
