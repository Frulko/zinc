# zinc:ui — text fields, pointer and keyboard

Desktop-grade input for `zinc:ui` (Solid, React/Inferno and the host ABI): text fields, a small code editor, pointer
events with capture, hover, cursors, keyboard shortcuts and zoomable views. Example: `zinc run examples/ui/forms`
(form, code editor, draggable cards on a pannable / zoomable canvas).

## Text fields

```tsx
const [name, setName] = createSignal('');
<input value={name()} onInput={(v: string) => setName(v)} onChange={(v: string) => save(v)} placeholder="Name" />
<input type="password" value={pin()} onInput={(v: string) => setPin(v)} />
<textarea rows={4} value={notes()} onInput={(v: string) => setNotes(v)} />
<textarea class="font-mono text-sm" lineNumbers wrap={false} value={code()} onInput={(v: string) => setCode(v)}
  highlight={(line: string) => ui.tsHighlight(line)} />
```

| attribute | |
| --- | --- |
| `value` | the text (controlled: setting the current value is a no-op, the caret is kept) |
| `onInput` | `(v: string) => void` after every edit |
| `onChange` | `(v: string) => void` when the field loses the focus or Enter is pressed (single line), after user edits. **React/Inferno**: `onChange` fires on every edit, like React |
| `placeholder` | shown while empty |
| `password` / `type="password"` | bullets; copy and cut are disabled |
| `readOnly` | selectable and copyable, not editable |
| `rows` | textarea height in lines when no height class is set (default 4) |
| `wrap={false}` | textarea: no line wrapping, horizontal scroll |
| `lineNumbers` | textarea: line number gutter; with `lineNumbers` or `font-mono` the textarea is a code editor: Tab inserts 2 spaces, Enter keeps the indentation |
| `highlight` | `(line: string) => i32[]`: colour runs `[length, color, length, color...]` for one visual line (`-1`: text colour). `ui.tsHighlight` colours TypeScript / Zinc keywords, types, strings, numbers, `//` comments and `/* */` comments within a line |

Default size: 200 px wide (stretch, `grow`, `w-*` size it), one line (or `rows` lines) high; styled by classes like any
node (`bg-*`, `text-*`, `border-*`, `rounded-*`, `p-*`, `font-mono`, `text-sm`...). The focused field gets a blue
border, or `focus:border-<color>`.

Editing: click places the caret (Shift+click extends), double click selects a word, triple click a line, drag
selects (the text scrolls past the edges); arrows, Alt/Ctrl+arrows by word, Cmd+arrows / Home / End by line,
Cmd+Up/Down or Ctrl+Home/End to the start / end, PageUp/PageDown, Shift extends; Backspace / Delete (by word with
Alt/Ctrl, to the line start with Cmd); Cmd/Ctrl+A, C, X, V, Z, Shift+Z / Y; Tab / Shift+Tab move the focus (Tab into
a single-line field selects it); Escape blurs. Undo coalesces consecutive typing into one step (100 steps).
The caret blinks without repainting in between; horizontal scroll follows the caret in inputs, vertical scroll and
the wheel in textareas. The wheel scrolls textareas like scroll containers: trackpads 1:1 with a rubber band past the
edges (the OS supplies the momentum), mouse notches ease 60 px each; at an edge the wheel goes on to an enclosing
scroll container.

Host ABI: `ui.createNode(ui.INPUT | ui.TEXTAREA)`, `setValue`, `getValue`, `setPlaceholder`, `onText(h, change, f)`,
`setHighlight`, `select(h, a, b)`, `caretOf`, `selectedText`, `focusNode(h)`, `focused()`; flags through
`setNumber(h, 'password' | 'readOnly' | 'lineNumbers' | 'wrap' | 'rows', v)`.

### Code editor extensions

For editors built on a textarea (`examples/zed-editor`), on the node handle (`ref`):

| function | |
| --- | --- |
| `setMarks(h, marks)` | decorations, flat `[start, end, color, kind]` per mark (UTF-16 offsets): `MARK_LINE` the background of every row of a line (and a brighter line number), `MARK_FILL` / `MARK_STRONG` a translucent / stronger range fill, `MARK_BOX` a 1 px box (matching brackets), `MARK_SQUIGGLE` a wavy underline (diagnostics), `MARK_GUTTER` a dot in the line number gutter. Drawn under the text; each call replaces the marks |
| `setEditColors(h, colors)` | `[lineNumber, activeLineNumber, gutterLine, selection, caret, indentGuide]`; `-1` keeps the default, `-2` draws none. Indent guides (every 2 columns of leading spaces, blank lines take the smaller indentation around them) are drawn when `indentGuide` is a colour |
| `setHighlightAt(h, f)` | like `highlight`, with the offset of the row in the value: `f(line, start)`. Highlighters that keep a state per line (block comments, template strings) look it up; takes precedence over `highlight` |
| `editView(h)` | `[scrollX, scrollY, contentHeight, viewportHeight, lineHeight, rows, gutter, contentWidth]` |
| `scrollEditTo(h, x, y)` | scrolls (clamped), stopping any wheel easing |
| `editRowOf(h, offset)` | visual row of an offset (the line when wrapping is off) |
| `repaint()` | repaint at the next frame |

A canvas with `style={{ lazy: 1 }}` does not force a repaint on every frame: it is drawn when anything else changed
(or after `ui.repaint()`). Icons and minimaps that only change with the UI stay free when the window is idle; a plain
canvas keeps the whole window repainting every frame.

Long texts: Zinc strings are UTF-8, so indexing a non-ASCII string (`charCodeAt`, `slice`) costs O(offset). Text fields
work line by line and slice the visible rows once per frame, so scrolling a 5000-line file stays at the display rate;
code that walks the value of a large field should do the same (`value.split('\n')`).

## Pointer events

On any node: `onPointerDown`, `onPointerMove`, `onPointerUp`, `onDoubleClick`, `onContextMenu` (right click),
`onWheel`, `onPointerEnter`, `onPointerLeave`, each `(e: ui.PointerEvent) => void`:

| field | |
| --- | --- |
| `x`, `y` | local to the node that handles the event, in its own units (inside a scaled view: world units) |
| `gx`, `gy` | surface coordinates (`ui.toLocal(h, gx, gy)` converts to another node's units) |
| `button` | 0 left, 1 middle, 2 right (-1 for moves) |
| `mods`, `shift`, `ctrl`, `alt`, `meta` | modifiers (`ui.SHIFT`, `CTRL`, `ALT`, `META` bits) |
| `clicks` | 2 on a double click (400 ms, 6 px) |
| `wheel`, `wheelX`, `pinch` | `onWheel`: steps (+ up / right) and the trackpad pinch factor |

- Dispatch: the topmost interactive node under the pointer (nodes with handlers, `onClick`, text fields; plain nodes
  are transparent), then up through its ancestors to the nearest one with a handler for that event.
  A raw `onPointerDown` stops at a button or a text field on the way up, so pressing a button inside a card with
  raw handlers does not drag it; with `onDrag` on the card instead, the button clicks on a tap and the card drags past
  the threshold (Gestures, below). Nodes under a `disabled` one get no events.
- Capture: the node whose `onPointerDown` ran gets every `onPointerMove` and the `onPointerUp` until the button is
  released, even outside its box (drags), unless a gesture takes the press (next section): it then gets
  `onPointerCancel` and nothing more for that press. Without capture, moves go to the node under the pointer.
- `onClick` / `onPress` keep their meaning: activated on release over the same node, not after a drag-scroll, and
  from the keyboard / gamepad (focus + A / Start / Enter / Space).
- Enter / leave follow the hover path (the node under the pointer and its ancestors), like DOM `pointerenter`.
- Mouse button events come in order from the HAL, so a quick trackpad tap is not lost between frames.

## Gestures

`onTap`, `onLongPress`, `onDrag` and `onPinch` take a `PointerEvent` too, with `phase` (0 start, 1 move, 2 end,
3 cancelled), `dx` / `dy` (the translation since the press, surface px), `scale` and `rotation` (radians, since the
pinch started) and `x` / `y` (local: the pointer, or the centroid of a pinch).

```tsx
<view class="h-12" dragAxis="x" onDrag={(e: ui.PointerEvent) => swipe(e.phase, e.dx)} />   {/* in a vertical list */}
<view class="grow" onPinch={(e: ui.PointerEvent) => zoomTo(start * e.scale, e.x, e.y)} onTap={select} />
<view grab="keep" onPointerDown={...} onPointerMove={...} />                                {/* never stolen */}
```

Arbitration, after Qt's pointer handlers: a press goes to the raw `onPointerDown` node (it captures the pointer) and,
passively, to every `onDrag` node from the pressed node up and to the scroll container under it. The first of them,
innermost first, whose threshold the pointer crosses takes the exclusive grab: `dragThreshold` px (default 8) along
`dragAxis` (`x`, `y`, `both`) for a drag, 8 px along a scrollable axis for a scroll container. The capture node then
gets `onPointerCancel`, and no click or tap follows. So a horizontal swipe row in a vertical list keeps horizontal
moves and gives vertical ones to the list, and a button inside a draggable card clicks unless the card is dragged.
`grab="keep"` on the capture node stops the stealing (drawing surfaces); `grab="keep-x"` only keeps mostly horizontal gestures, so a vertical swipe still scrolls (the kit's `Slider`).

| handler | fires |
| --- | --- |
| `onTap` | on release, when no gesture took the press, no long press fired and the pointer is still over the node |
| `onLongPress` | after 500 ms held without a gesture; the click and the tap are dropped |
| `onDrag` | phase 0 when it takes the grab, 1 on each move, 2 on release, 3 when a pinch takes over |
| `onPinch` | when a second finger lands on it (or on the node under the first finger's press): the pinch takes the grab from anything else; 0 / 1 / 2 as the fingers land, move and lift |

Multitouch: the first finger is the pointer (taps, scrolling, drags); the SDL HAL reports the other fingers of touch
screens (`zinc:gfx` touches), and `ui.touchAt(id, x, y, phase)` (0 down, 1 move, 2 up) scripts fingers in tests.
`zinc:gestures` stays the tool for canvases and games that read the raw input themselves.

## Focus scopes and keymaps

```tsx
<view keyContext="Editor">...</view>
ui.bindKeys('mod-s', 'save');                  // everywhere; mod = Cmd or Ctrl
ui.bindKeys('mod-k', 'palette', 'Editor');     // only with the focus inside keyContext="Editor"
ui.onAction(-1, 'save', save);                 // global handler; ui.onAction(h, ...) for a node and its subtree
ui.keysFor('save')                             // ['mod-s']: hints in menus and tooltips (kit keyLabel: '⌘S')
ui.focusScope(dialog, { trap: true, restore: true, autoFocus: true });
```

- **Keymaps** (GPUI): a keystroke is modifiers and a key joined by `-` (`cmd-s`, `ctrl-shift-p`, `mod-k`, `alt-up`,
  `escape`, `f5`, `j`). The deepest `keyContext` on the focus path that binds the keystroke wins, then global
  bindings; later bindings win over earlier ones. The action goes to the nearest `onAction` handler from the focused
  node up, then to the global ones. Keystrokes with Cmd / Ctrl are matched before a focused text field edits; the
  others only when it did not use them, so typing never triggers `j`. `ui.dispatchAction(action)` runs an action from
  code (menus, palettes).
- **Tab order**: `tabIndex={n}` with n > 0 comes first (ascending), then the tree order; `tabIndex={-1}` is focusable
  by click or code but not by Tab. `disabled` (a flag, dynamic under Solid) removes a node and its subtree from
  pointer events, clicks and the focus.
- **Focus scopes**, on a node that is shown and hidden (mounted, or `hidden` toggled): `trap` keeps Tab, Shift+Tab and
  the arrow navigation inside it while it is on screen (the latest trap wins); `restore` gives the focus back, when it
  leaves the screen, to the node that had it when it showed; `autoFocus` focuses its first control when it shows.
- `focus-within:bg-*` / `text-*` / `border-*` apply while the focus is in the node's subtree
  (`ui.hasFocusWithin(h)`); `ui.onFocusChange(f)` reports every focus move (`-1`: none).
- **Dismissal**: `ui.onDismiss(h, f)`: Escape runs the handler of the most recently shown node that has one (after the
  focused node's `onKeyDown`, before a text field's own Escape). `ui.onOutsidePointer(h, f, except)`: a press outside
  h (and outside `except`, the button that toggles it) while h is on screen.

## Layers and anchored positioning

```tsx
ui.openLayer(menu, { priority: 100 });                              // modal, backdrop (a colour), backdropAlpha
ui.anchor(menu, button, 'bottom-start', 4);                         // offset 4 px, flip, 8 px margin
ui.anchorPoint(contextMenu, e.gx, e.gy);                            // at a point
ui.openLayer(dialog, { priority: 200, modal: true, backdrop: 0x000000 });
```

A layer node stays where it is declared (its component owns it; Solid and React mount and unmount it as usual), but
it is laid out on the whole surface (its `left` / `top` / `right` / `bottom` / `inset-0` classes place it, else
`ui.anchor`), painted after the root in priority order (then opening order) and hit-tested first; the overflow
clipping and the scroll offsets of its ancestors do not apply. A modal layer blocks the hits below it, and its
backdrop dims them. `ui.anchor` places the float next to a node or a point at the end of each layout and each frame
(so it follows a scrolling target), flips it to the other side when it does not fit and there is more room there, and
keeps it `margin` px inside the surface. `closeLayer` / `unanchor` undo them; a destroyed node leaves every registry.

The kit builds its overlays on these (docs/ui-kit.md): Tooltip, Popover, DropdownMenu, Dialog, toast.

## Hover and cursors

`hover:bg-*`, `hover:text-*`, `hover:border-*` apply while the pointer is over the node or a descendant (other
`hover:` tokens are accepted and ignored). `focus:border-*` joins `focus:bg-*` / `focus:text-*`.

`cursor-default`, `cursor-pointer`, `cursor-text`, `cursor-move`, `cursor-grab`, `cursor-grabbing`,
`cursor-ew-resize` / `cursor-col-resize`, `cursor-ns-resize` / `cursor-row-resize`, `cursor-crosshair`,
`cursor-not-allowed`: the nearest one from the hovered node up (text fields show the I-beam); `cursor-grab` shows
grabbing while its node has the pointer captured. SDL has no hand cursors: grab / grabbing show the move cursor.

## State variants of any paint property

`hover:`, `focus:`, `active:` and `disabled:` change paint-only properties without a relayout: `opacity-*`, `translate-x/y-*`, `shadow-*`, `bg-*`, `text-*` colours, `border-*` colours and `rounded-*` (other tokens are build errors). The same properties follow other nodes:

| Variant | Follows |
| --- | --- |
| `group-hover:` `group-focus:` `group-active:` | the nearest ancestor with the `group` class |
| `peer-hover:` `peer-focus:` `peer-active:` | the nearest sibling before it with the `peer` class |
| `aria-checked:` (also `selected`, `expanded`, `pressed`, `disabled`, `busy`, `current`, `invalid`, `required`, `readonly`) | the attribute is `"true"`: `<View aria-checked={on()} class="bg-slate-400 aria-checked:bg-emerald-500" />`, or `ui.setAttr(node, 'aria-checked', 'true')` |
| `data-[state=open]:` | the attribute `data-state` equals `open`: `data-state="open"` in JSX or `ui.setAttr(node, 'data-state', 'open')` |

A program can use at most 20 distinct attribute conditions; the golden is `tests/golden/ui-state`.

## Keyboard

```tsx
<view focusable onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Delete') removeSelected(); }}>...</view>
ui.onKey((e: ui.KeyEvent) => { if (e.primary && e.key === 's') { save(); e.preventDefault(); } });
```

`KeyEvent`: `key` like DOM `KeyboardEvent.key` but unshifted (`'a'`, `'1'`, `' '`, `'Enter'`, `'Tab'`, `'Escape'`,
`'Backspace'`, `'Delete'`, `'ArrowLeft'`..., `'Home'`, `'End'`, `'PageUp'`, `'PageDown'`, `'F1'`...`'F12'`), `mods`,
`shift`/`ctrl`/`alt`/`meta`, `primary` (Cmd or Ctrl, for shortcuts on every OS), `repeat`, `preventDefault()`.

Order for each key down: the focused node's `onKeyDown` (or its nearest ancestor's), then the text field's editing
keys, then the global `ui.onKey` handlers, each only if nothing before called `preventDefault()` / handled it.
Printable keys are handled by a focused text field (typing never triggers single-letter shortcuts). Unhandled
arrows, Tab / Shift+Tab, Enter and Space drive the existing focus navigation (also from a quick tap); while a text
field has the focus the gamepad-style navigation (arrows, WASD, Space...) is off. A printable key that a handler
consumed (`preventDefault()`, e.g. ⌥Z as a shortcut) does not also type its character, as in the DOM. Escape is an ordinary key for
`zinc:ui` programs (close a dialog, go back: `preventDefault()` in a handler); unhandled, it blurs the focused node, and
with nothing focused it does the platform default (`gfx.escapeDefault()`: leave fullscreen, else quit; nothing in
kiosk mode). Plain `zinc:gfx` programs keep the HAL behaviour unless they call `gfx.escapeByApp(true)`.

## Zoom and pan

`style={{ scale, translateX, translateY }}` on a view transforms the view and its subtree: scale around the view's
top-left corner, then translate (in the parent's units). Painting, hit testing, hover, pointer event coordinates,
`ui.toLocal` and `ui.screenBox` follow it; a node graph canvas is a viewport (`overflow-hidden`, pan / zoom
handlers) holding a world view:

```tsx
<view class="grow overflow-hidden" onWheel={zoomAt} onPointerDown={startPan} onPointerMove={pan} onPointerUp={endPan}>
  <view ref={world} class="absolute left-0 top-0 w-[2000] h-[2000]" style={{ scale: zoom(), translateX: panX(), translateY: panY() }}>
    <For each={nodes()}>{(n: GNode) => <Card node={n} />}</For>
  </view>
</view>
```

Zoom around the pointer: `wx = (e.x - panX) / z`, then `panX = e.x - wx * z2` (same for y). Text in a scaled view
uses the nearest baked font size, so its width is approximate at unusual zooms. (`scale` on a `<text>` keeps its
legacy meaning: font size 8 × scale.)

## Scrolling

Scroll containers (`<ScrollView>`, `overflow-y-auto` / `overflow-x-auto`) run one physics state per axis in
`lib/std/ui.ts` (`ScrollAxis`), with the constants of the reference implementations:

| phase | behaviour |
| --- | --- |
| direct | fingers move the content 1:1; past an edge the shown offset is the closed-form rubber band `(1 - 1/(x·0.55/dim + 1))·dim` of the raw overscroll (UIScrollView) |
| release | velocity = least-squares slope of the last 100 ms (0 if the fingers rested > 40 ms, like Flutter's VelocityTracker), capped at 8000 px/s |
| inertia | `v·0.998^ms` (iOS normal deceleration); an edge reached hands the velocity (≤ 5000 px/s) to the bounce |
| bounce | critically damped spring toward the edge, ω = 10/s (iOS / GTK overshoot) |
| wheel | notches: a critically damped spring toward 48 px per notch, retargeted while turning |

Input: the SDL HAL reports trackpad fingers (`SDL_HINT_TRACKPAD_IS_TOUCH_ONLY`), so the lift is exact, and
resamples the precise deltas at frame time (now - 5 ms, linear between events, extrapolation ≤ 8 ms: Chromium /
Android) into `HalInput.scroll_dx / dy / phase` (`gfx.scrollDX / scrollDY / scrollPhase`). OS momentum is off;
the engine's inertia replaces it, so the same physics run on touch screens and in tests
(`tests/conformance/scroll_physics.tsx`). Without finger events a 50 ms gap ends the gesture. Landing fingers
catches a running inertia.

## Tests

Test hooks drive the input headlessly; from the first call on, the HAL's pointer and keyboard are ignored, so a
program prints the same on the sim and on native targets (`tests/conformance/input.tsx`, `input_react.tsx`):
`ui.pointerAt(x, y, down, button = 0, mods = 0)`, `ui.touchAt(id, x, y, phase)`, `ui.wheelAt(x, y, dy, dx = 0, pinch = 1)`,
`ui.keyDown(h, key, mods = 0)` (returns whether it was handled), `ui.typeText(h, s)` (`h = -1` keeps the focus).
`zinc test` gives native runs a private clipboard (`ZINC_CLIPBOARD=local`) and runs both sides in deterministic mode
(virtual clock, fixed `dt`, no live input; [guide](guide/06-testing.md#determinism)). A real session can be recorded
with `ZINC_RECORD=s.tape` and replayed with `ZINC_REPLAY`; `zinc test --pixels` compares rendered frames with golden
PNGs (`tests/visual/ui.tsx` hovers and clicks through the hooks).

## HAL and zinc:gfx

`HalInput` has additive fields: `keys` (down / up / repeat / typed text, with modifiers, in order), `text`, `btn`
(mouse button presses / releases with positions), `pbuttons`, `mods`, `wheel_x`; HALs without them leave them empty.
Optional HAL hooks with weak defaults in the runtime: `hal_text_input` (SDL_StartTextInput / SetTextInputArea),
`hal_clipboard_get` / `hal_clipboard_set` (default: process-local), `hal_set_cursor`. Implemented by the SDL3 HAL
(macos, linux) and the wasm HAL (keyboard, typed text, buttons, wheel, clipboard via paste events and
`navigator.clipboard`, CSS cursors). `zinc:gfx` exposes them: `keyCount`, `keyKind`, `keyName`, `keyMods`,
`modifiers`, `pointerButtons`, `buttonEventCount/X/Y/Button/Down`, `wheelX`, `startTextInput`, `stopTextInput`,
`clipboardText`, `setClipboardText`, `setCursor` (no-ops / empty on the sim).

Not done yet: IME composition preview (committed text works), comments spanning lines in `tsHighlight` (use
`setHighlightAt` with a per-line state, as `examples/zed-editor` does), multiple carets, word-wise drag
selection after a double click, exact-size fonts for continuous zoom.

## Icons

`zinc:icons` draws the [Lucide](https://lucide.dev) set (1848 icons, ISC, pinned in `next/third_party/lucide`) through `zinc:svg`:

```tsx
import { Icon, icon } from 'zinc:icons';
<Icon name="heart" size={20} color={() => theme().accent} strokeWidth={2} />
```

Only the icons a project names are compiled in: the compiler collects `<Icon name="...">` and `icon('...')` with literal names from the project's
sources, plus `zinc.json` `"icons": ["compass", "moon"]` for names decided at run time (`["*"]` compiles the whole set). `icon(name, color, strokeWidth)`
returns the parsed `Svg` (cached) or null for a name that was not compiled in; `iconNames()` lists them.

## Object styles and StyleSheet

Host JSX nodes accept inline CSS-like objects, reusable `StyleSheet.create` entries, and flat arrays mixing both.
Import `StyleSheet` from `zinc:ui`; the same syntax works with Zinc's Solid and React renderers and the kit host.

```tsx
import { StyleSheet } from 'zinc:ui';

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8, backgroundColor: '#ffffff', borderRadius: 12 },
  selected: { border: '2px solid #2563eb' },
});

// Solid: active() and opacity() are signals. React: use the corresponding state values.
<view class="w-full" style={[styles.card, active() && styles.selected, { opacity: opacity() }]} />
<text style={{ fontSize: 24, fontWeight: 'bold', color: 'rgb(15,23,42)' }}>Hello</text>
```

Named styles can live in an imported `.ts` module or inside a component. Use module scope when the values are
shared and constant. `StyleSheet.create` is a compiler intrinsic: named CSS objects become immutable `Style`
records before type checking/code generation. Arbitrary mutable plain objects are not runtime style dictionaries;
use `StyleSheet.create` to prepare reusable entries. Styles are immutable by convention: do not mutate their arrays.
`StyleSheet.compose(base, override)` and `StyleSheet.flatten(styles)` return a composed `Style`; avoid calling them
on every frame when the composition is constant.

Supported properties:

- Flex layout: `flexDirection` (`row`/`column`), `flexWrap`, `justifyContent`, `alignItems`, `alignSelf`, `alignContent`,
  `flexGrow`/`grow`, `flexShrink`, `flexBasis` (number, percent, `auto`), `gap`. `flex: n` is React Native's shorthand in the `rn`
  layout mode (grow n, shrink 1, basis 0; `0` rigid; `-1` shrink only) and an alias of grow in `classic`.
- Dimensions: `width`, `height` (numbers, px, percentages, auto); padding/margin and individual sides, plus
  `paddingHorizontal/Vertical`, `marginHorizontal/Vertical`. String padding/margin use CSS 1–4-value shorthand.
- Position: `position` (`relative`/`static`/`absolute`), `top/right/bottom/left`, `display` (`flex`/`none`),
  `overflow` (`visible`/`hidden`/`auto`/`scroll`). Relative means normal flow; offsets position absolute nodes.
- Paint: `backgroundColor`/`background`, `color`, `borderColor`, `borderWidth`, side border widths, `borderRadius`,
  `border: '<width> solid <color>'`, `opacity`, `translateX/Y`, `scale`.
- Text: `fontSize`, `fontFamily`, `fontWeight`, `lineHeight` (absolute units), `letterSpacing` (px), `textAlign`.
- Existing numeric aliases remain: `bg`, `radius`, `x/y`, `hidden`, `lazy` (canvas).

CamelCase and quoted CSS kebab-case keys work. Numbers are logical pixels except unitless properties. `rem`/`em`
currently mean 16 logical pixels, not inherited CSS font sizes. Colors accept the named subset in the compiler,
`#RGB`, `#RRGGBB`, `rgb(...)`; background colors additionally accept alpha hex and `rgba(...)`. Static 24-bit colors
are encoded separately from floating/fixed-point values, preserving them on PS1 profiles. Dynamic numeric colors
still follow the target's `number` range; choose conditional named styles for portable color changes.

Dynamic values inside an inline object must be numeric Zinc expressions. For enum/string changes, select named
styles with `condition ? styles.a : styles.b` or `condition && styles.a`. `null`, `false`, `undefined` branches are
empty styles. Object spreads, nested style arrays, `calc`, grid, min/max dimensions, arbitrary CSS
selectors and the React Native transform-array syntax are not implemented. Unsupported keys/values are build errors.
Static font sizes (1–256 px) are passed to font baking; dynamic sizes use Zinc's existing nearest baked font behavior.

### Precedence, reset and caching

Classes/CSS imports provide the base. Style array layers apply left to right; the last value wins, including
shorthand expansion. Removing a conditional layer restores the preceding layer or class/default value, including
transforms. Imperative `ui.setNumber`/engine animation values sit above the stylesheet and survive a class change.

Static inline objects are hoisted by the compiler. Shared named entries keep their identity. Each node retains
only its last style layers and resolved properties: there is no global cache of animated values. Unchanged layer
identities skip resolution; fresh inline records compare by value. With an unchanged property set, only changed
numeric values are applied; opacity/translation changes invalidate painting without relayout. Removing/changing the
property set rebuilds that node's base styles. Dynamic inline records/arrays still allocate; prefer shared static
styles and engine animations for long-running motion. CSS strings are normalized at build time, not parsed per frame.

[Figma UI documents](figma-ui.md) use these same style properties and generate this same TSX API.

## Surfaces: a canvas inside a page

`ui.createSurface(w, h)` makes a node that shows a runtime image the program fills (a WebGL canvas, video frames). It is laid out and painted like an `<image>`, so it scrolls and clips with its page; `ui.surfaceImage(node)` is the image handle to fill.

With `"webgl": true` in `zinc.json`, `zinc:script` contexts get `document.createElement('canvas').getContext('webgl' | 'webgl2')`, and `gl.zincPresent(image)` copies the drawing buffer into the surface (rows flipped, no alpha):

```ts
const vm = new Script({ engine: 'quickjs' });
vm.eval(source);                                   // creates a canvas and a draw(image) function
const view = ui.createSurface(256, 256);
vm.call('draw', [ui.surfaceImage(view)]);          // every frame, or when the scene changes
ui.repaint();                                      // the surface changed behind the UI's back: an idle page keeps its last frame otherwise
```

`tests/golden/webgl-surface` is the working example.

## Style reference

<!-- ui-docs:begin -->
### Style keys (generated)

Object-style keys of `lib/std/ui.ts` (`PROP` table); `tools/ui-docs` rewrites this block.

| Id | Style key | Aliases |
|---|---|---|
| 1 | `opacity` |  |
| 2 | `translateX` | `x` |
| 3 | `translateY` | `y` |
| 5 | `bg` | `backgroundColor` |
| 6 | `backgroundAlpha` |  |
| 7 | `borderColor` |  |
| 8 | `color` |  |
| 9 | `radius` | `borderRadius` |
| 10 | `scale` |  |
| 11 | `lazy` |  |
| 12 | `password` |  |
| 13 | `readOnly` |  |
| 14 | `lineNumbers` |  |
| 15 | `wrap` |  |
| 16 | `rows` |  |
| 17 | `width` |  |
| 18 | `height` |  |
| 19 | `widthPercent` |  |
| 20 | `heightPercent` |  |
| 21 | `flexDirection` |  |
| 22 | `flexWrap` |  |
| 23 | `justifyContent` |  |
| 24 | `alignItems` |  |
| 25 | `position` |  |
| 26 | `overflow` |  |
| 27 | `fontWeight` |  |
| 28 | `textAlign` |  |
| 29 | `lineHeight` |  |
| 30 | `letterSpacing` |  |
| 31 | `borderWidth` |  |
| 32 | `borderTopWidth` |  |
| 33 | `borderRightWidth` |  |
| 34 | `borderBottomWidth` |  |
| 35 | `borderLeftWidth` |  |
| 36 | `paddingTop` |  |
| 37 | `paddingRight` |  |
| 38 | `paddingBottom` |  |
| 39 | `paddingLeft` |  |
| 40 | `marginTop` |  |
| 41 | `marginRight` |  |
| 42 | `marginBottom` |  |
| 43 | `marginLeft` |  |
| 44 | `grow` |  |
| 45 | `gap` |  |
| 46 | `padding` |  |
| 47 | `fontSize` |  |
| 48 | `hidden` |  |
| 49 | `keepFocus` |  |
| 50 | `inputMode` |  |
| 51 | `top` |  |
| 52 | `left` |  |
| 53 | `right` |  |
| 54 | `bottom` |  |
| 55 | `shrink` | `flexShrink` |
| 56 | `basis` | `flexBasis` |
| 57 | `basisPercent` |  |
| 58 | `alignSelf` |  |
| 59 | `alignContent` |  |

### Accepted class tokens (generated)

The tokens of `tests/golden/ui-tokens` that `isKnownClass` accepts (families such as `p-N`, `rounded-*` and the colour scale take more values than the samples):

`-m-4`, `-ml-px`, `-mt-2`, `-mx-1`, `-translate-y-1`, `-word-1`, `-z-10`, `@container`, `absolute`, `align-baseline`, `align-sub`, `align-super`, `aspect-[4/3]`, `aspect-auto`, `aspect-square`, `aspect-video`, `basis-0`, `basis-1/2`, `basis-32`, `basis-auto`, `basis-full`, `bg-white`, `border`, `border-b-white/50`, `border-dashed`, `border-dotted`, `border-solid`, `border-t-red-500`, `border-x-blue-600`, `bottom-0`, `break-all`, `break-normal`, `break-words`, `capitalize`, `content-between`, `content-evenly`, `flex-auto`, `flex-col-reverse`, `flex-none`, `flex-row`, `flex-row-reverse`, `flex-wrap`, `font-[Inter,Roboto-Mono]`, `font-black`, `font-light`, `font-medium`, `font-thin`, `gap-2`, `gap-[10px]`, `gap-x-4`, `gap-y-2`, `group`, `grow`, `grow-2`, `grow-[0.5]`, `h-1/3`, `h-8`, `h-[1.5rem]`, `h-[10vh]`, `h-[25%]`, `h-screen`, `hidden`, `inset-0`, `inset-4`, `inset-[8px]`, `inset-x-2`, `inset-y-1`, `invisible`, `italic`, `items-center`, `justify-between`, `left-3`, `line-clamp-3`, `line-clamp-none`, `line-through`, `lowercase`, `m-2`, `m-auto`, `max-h-[300px]`, `max-w-full`, `max-w-md`, `min-h-screen`, `min-w-0`, `ml-6`, `ml-auto`, `mr-auto`, `mt-1`, `mt-auto`, `mx-3`, `mx-auto`, `my-auto`, `no-underline`, `normal-case`, `not-italic`, `opacity-50`, `order-2`, `order-first`, `order-last`, `outline`, `outline-2`, `outline-none`, `outline-offset-1`, `outline-red-500`, `overline`, `p-4`, `pb-[env(keyboard-inset)]`, `peer`, `pointer-events-auto`, `pointer-events-none`, `pt-1`, `pt-[env(safe-area-inset-top)]`, `px-2`, `relative`, `right-1`, `ring`, `ring-0`, `ring-2`, `ring-4`, `ring-indigo-500`, `ring-offset-2`, `rounded-b-[6px]`, `rounded-br`, `rounded-l-full`, `rounded-lg`, `rounded-t-lg`, `rounded-tl-xl`, `scroll-p-4`, `scroll-pt-2`, `scroll-px-3`, `select-all`, `select-auto`, `select-none`, `select-text`, `self-auto`, `self-end`, `shrink`, `shrink-0`, `shrink-[0.5]`, `size-8`, `snap-align-none`, `snap-both`, `snap-center`, `snap-end`, `snap-mandatory`, `snap-none`, `snap-proximity`, `snap-start`, `snap-x`, `snap-y`, `sr-only`, `static`, `sticky`, `text-balance`, `text-clip`, `text-ellipsis`, `text-justify`, `text-lg`, `text-nowrap`, `text-shadow`, `text-shadow-lg`, `text-shadow-md`, `text-shadow-none`, `text-shadow-red-500`, `text-shadow-sm`, `text-wrap`, `top-2`, `translate-x-2`, `translate-x-[3px]`, `truncate`, `underline`, `uppercase`, `visible`, `w-1/2`, `w-4`, `w-[100px]`, `w-[10vw]`, `w-[2rem]`, `w-[50%]`, `w-full`, `w-screen`, `whitespace-normal`, `whitespace-nowrap`, `whitespace-pre`, `whitespace-pre-wrap`, `word-4`, `word-[3px]`, `z-10`, `z-[5]`, `z-auto`
<!-- ui-docs:end -->
