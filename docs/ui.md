# zinc:ui — text fields, pointer and keyboard

Desktop-grade input for `zinc:ui` (Solid, React/Inferno and the host ABI): text fields, a small code editor, pointer
events with capture, hover, cursors, keyboard shortcuts and zoomable views. Example: `zinc run examples/ui/forms`
(form, code editor, draggable cards on a pannable / zoomable canvas).

## What the primitives draw

The host elements draw nothing a program did not ask for, as React Native's do; the look comes from `className`, `style` or a kit
(`zinc:ui/kit`, `zinc:ui/nuxt`).

| element | without a class or a style |
| --- | --- |
| `View` | nothing; a border width with no colour is grey-200 `#e5e7eb` (black under the react-native preset or the `rn` layout, as React Native's) |
| `Text` | 16 px Inter (14 px under the react-native preset); black on a light window and white on a dark one (the brightness of `render`'s background, white before the first frame), always black under the react-native preset |
| `Button` | nothing: a box that takes the focus, Enter and Space, and centres its content |
| `Input`, `TextArea` | their text, caret, placeholder (`#64748b`, `placeholderTextColor`) and selection (`selectionColor`) only, in the colour and size of the text around them (the caret: `cursorColor`); no fill, border, radius or padding |
| `Image`, `Canvas`, `ScrollView` | the picture; a scroll view shows its bars while it scrolls (`showsVerticalScrollIndicator={false}`, `showsHorizontalScrollIndicator={false}` hide them) |

Kept on purpose: an element with `onClick` dims while pressed (`pressFeedback={0}` or `ui.setPressFeedback(false)` turn it off, see
"Pressed feedback"); the keyboard focus ring, a 2 px `#facc15` ring around what the keyboard focused (on a field too when it has no
border; `outline-none` or the style `outlineStyle: 'none'` (or `outlineWidth: 0`) removes it); a field with a border gets a 2 px `#3b82f6` border while
focused (`focus:border-<color>` recolours it).

Before 0.7 a Button was a slate box (`bg-slate-700 px-2 py-1`) and a field a dark slate panel with light text. `zinc migrate
ui-explicit-looks --apply` writes that look into the classes of a program that relied on it (`docs/guide/10-lint-migrate.md`).

## Text fields

```tsx
const [name, setName] = createSignal('');
<Input value={name()} onInput={(v: string) => setName(v)} onChange={(v: string) => save(v)} placeholder="Name" />
<Input type="password" value={pin()} onInput={(v: string) => setPin(v)} />
<TextArea rows={4} value={notes()} onInput={(v: string) => setNotes(v)} />
<TextArea className="font-mono text-sm" lineNumbers wrap={false} value={code()} onInput={(v: string) => setCode(v)}
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
| `rows` | textarea height in lines when no height class is set (default 4); `rows={0}`: as tall as its content, like CSS `field-sizing: content` (a block editor's paragraphs: the field grows and shrinks as the text wraps, before the frame is painted) |
| `wrap={false}` | textarea: no line wrapping, horizontal scroll |
| `lineNumbers` | textarea: line number gutter; with `lineNumbers` or `font-mono` the textarea is a code editor: Tab inserts 2 spaces, Enter keeps the indentation |
| `highlight` | `(line: string) => i32[]`: colour runs `[length, color, length, color...]` for one visual line (`-1`: text colour). `ui.tsHighlight` colours TypeScript / Zinc keywords, types, strings, numbers, `//` comments and `/* */` comments within a line |

Default size: 200 px wide (stretch, `grow`, `w-*` size it), one line (or `rows` lines) high; styled by classes like any
node (`bg-*`, `text-*`, `border-*`, `rounded-*`, `p-*`, `font-mono`, `text-sm`...); with none it draws only its text, caret
and placeholder ("What the primitives draw"). A field with a border gets a blue border while focused, or `focus:border-<color>`.

Editing: click places the caret (Shift+click extends), double click selects a word, triple click a line, drag
selects (the text scrolls past the edges); arrows, Alt/Ctrl+arrows by word, Cmd+arrows / Home / End by line,
Cmd+Up/Down or Ctrl+Home/End to the start / end, PageUp/PageDown, Shift extends; Backspace / Delete (by word with
Alt/Ctrl, to the line start with Cmd); Cmd/Ctrl+A, C, X, V, Z, Shift+Z / Y; Tab / Shift+Tab move the focus (Tab into
a single-line field selects it); Escape blurs. Undo coalesces consecutive typing into one step (100 steps).
The caret blinks without repainting in between; horizontal scroll follows the caret in inputs, vertical scroll and
the wheel in textareas. The wheel scrolls textareas like scroll containers: trackpads 1:1 with a rubber band past the
edges and the OS momentum after the lift, mouse notches ease 48 px each; at an edge the wheel goes on to an enclosing
scroll container.

Host ABI: `ui.createNode(ui.INPUT | ui.TEXTAREA)`, `setValue`, `getValue`, `setPlaceholder`, `onText(h, change, f)`,
`setHighlight`, `select(h, a, b)`, `caretOf`, `anchorOf`, `selectedText`, `focusNode(h)`, `focused()`; flags through
`setNumber(h, 'password' | 'readOnly' | 'lineNumbers' | 'wrap' | 'rows', v)`.

### Code editor extensions

For editors built on a textarea (`examples/zed-editor`), on the node handle (`ref`):

| function | |
| --- | --- |
| `setMarks(h, marks)` | decorations, flat `[start, end, color, kind]` per mark (UTF-16 offsets): `MARK_LINE` the background of every row of a line (and a brighter line number), `MARK_FILL` / `MARK_STRONG` a translucent / stronger range fill, `MARK_BOX` a 1 px box (matching brackets), `MARK_SQUIGGLE` a wavy underline (diagnostics), `MARK_GUTTER` a dot in the line number gutter, `MARK_CARET` a 2 px caret at `start` (another person's caret in a collaborative editor; `end` is ignored). Drawn under the text; each call replaces the marks |
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

## Styled runs inside one text

`ui.setTextRuns(h, runs)` styles parts of a text node without splitting it: `runs` is `[length, style, color, ...]` over its text, in
order; `style` or-s `ui.RUN_BOLD`, `RUN_ITALIC`, `RUN_MONO` and `RUN_UNDERLINE` (0: the text's own), `color` is `0xRRGGBB`, `-1` for
the text's colour, or `ui.schemeColor('name')` for a `defineScheme` variable that follows the scheme. The lines wrap at spaces with each
run measured in its own face, and a `select-text` node still selects and copies as one text (`tests/golden/ui-runs`). It is how a
paragraph of markdown keeps its **bold**, `code` and links in one selectable text (examples/agents). `break-words` cuts a word longer
than the line (a path, a URL) where it stops fitting. Otherwise plain wrapping only: with a `whitespace-*`, `break-all`,
`line-clamp-*`, `truncate`, `text-balance`, case transform or word-spacing class the runs are ignored, and
a text shadow is not drawn under runs. A face is only there if the program bakes it: `RUN_MONO` needs a `font-mono` somewhere in the
program. `setTextRuns(h, [])` removes them.

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
<View className="h-12" dragAxis="x" onDrag={(e: ui.PointerEvent) => swipe(e.phase, e.dx)} />   {/* in a vertical list */}
<View className="grow" onPinch={(e: ui.PointerEvent) => zoomTo(start * e.scale, e.x, e.y)} onTap={select} />
<View grab="keep" onPointerDown={...} onPointerMove={...} />                                {/* never stolen */}
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

## Drag and drop (`zinc:ui/dnd`)

Moving things between places (reordering blocks, cards between columns, files onto a folder), after Atlassian's
[Pragmatic drag and drop](https://github.com/atlassian/pragmatic-drag-and-drop): the same three pieces, on nodes instead of
DOM elements and on the `onDrag` gesture instead of the browser's HTML5 drag and drop, so a mouse, a finger and a pen
drag the same way on every target.

```tsx
import * as dnd from 'zinc:ui/dnd';
const off = dnd.draggable(row, { data: block.id, handle: grip });                    // what can be dragged
dnd.dropTarget(row, { data: block.id, edges: dnd.EDGES_VERTICAL,                      // where it can land
  canDrop: (d: dnd.DragInfo) => d.data !== block.id });
dnd.monitor({ onDrag: (d: dnd.DragInfo) => showLine(d.targets), onDrop: (d: dnd.DragInfo) => move(d.data, d.targets) });
dnd.autoScroll(list);                                                                 // scrolls near its top and bottom
```

- `draggable(node, { data, handle, threshold, canDrag, onDragStart, onDrag, onDrop })`: a press on `handle` (default the
  node) that moves `threshold` px (default 3) starts a drag carrying `data`.
- `dropTarget(node, { data, edges, canDrop, onDragEnter, onDragLeave, onDrag, onDrop })`: the targets under the pointer are
  the node there (`ui.nodeAt`, through clips and scroll offsets) and its ancestors that are targets and accept the drag,
  innermost first. `edges` (`EDGE_TOP`, `EDGE_BOTTOM`, `EDGE_LEFT`, `EDGE_RIGHT`, `EDGES_VERTICAL`, `EDGES_HORIZONTAL`)
  gives each record its closest edge (Pragmatic's hitbox `closest-edge`).
- `monitor({ onDragStart, onDrag, onDropTargetChange, onDrop })` sees every drag. A cancelled drag is a drop on nothing
  (`targets` empty).
- `DragInfo`: `source`, `data`, `x` / `y` (surface px), `dx` / `dy`, `targets` and `previous` (`DropRecord`: `node`,
  `data`, `edge`), `self` in a target's own callbacks. Each function returns the one that undoes it.
- The preview is the app's (a translucent copy, a line where it lands): nothing is drawn by the module. The test is
  `tests/t0/ui_dnd.sh`.

## Focus scopes and keymaps

```tsx
<View keyContext="Editor">...</View>
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

A layer shows and hides with a motion: `motion` is `'none'`, `'fade'` (the default with a backdrop), `'scale'` (fades and grows from 96%: a
dialog), `'slide'` (from the bottom: a sheet) or `'slide-top'` / `'slide-left'` / `'slide-right'` (a drawer), over `duration` ms (180; the way
out is 20% quicker), ease-out in and ease-in out. Only the content moves: the backdrop, and a translucent full-size view the content puts
behind itself (React Native's dimmed view in a transparent Modal), fade in place and never slide or scale. Hiding the layer node (`hidden`)
plays the motion backwards: the node is painted until it has left, out of reach of the pointer and the focus; a toggle half way turns back
from where it is. Frames run only while a motion moves. `ui.layerProgress(h)` (0..1) tells where it is.

```tsx
ui.openLayer(sheet, { priority: 200, modal: true, backdrop: 0x000000, backdropAlpha: 110, motion: 'slide', duration: 250 });
```

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
| `aria-checked:` (also `selected`, `expanded`, `pressed`, `disabled`, `busy`, `current`, `invalid`, `required`, `readonly`) | the attribute is `"true"`: `<View aria-checked={on()} className="bg-slate-400 aria-checked:bg-emerald-500" />`, or `ui.setAttr(node, 'aria-checked', 'true')` |
| `data-[state=open]:` | the attribute `data-state` equals `open`: `data-state="open"` in JSX or `ui.setAttr(node, 'data-state', 'open')` |

A program can use at most 20 distinct attribute conditions; the golden is `tests/golden/ui-state`.

### Pressed feedback

What a mouse, a finger or the keyboard (Space, Enter) presses dims while it is held, as React Native's TouchableOpacity does: the opacity
goes to 0.6 in 80 ms and back in 150 ms after the release, at least 100 ms for a quick tap (120 ms for a key), without a relayout. Every node with
`onClick` (a button, a link-like text, a list row, a tab, a chip) gets it, through every kit; zinc:react-native's Pressable shows none, as React
Native's (its `style` and `children` take `{ pressed }`). Dragging off the node lifts the dim (the
release there presses nothing), a scroll that starts on it cancels it, and a disabled node is never pressed. The focus ring is separate.
Not dimmed: a node with an `active:opacity-*` class (its own pressed opacity; `active:` colours add to the dim), a node with `pressFeedback={0}`
(a style key too: Pressable, TouchableOpacity, TouchableHighlight and TouchableWithoutFeedback use it), a node that holds other pressables (a panel that
swallows clicks) and a full-screen catcher (a backdrop). `ui.setPressFeedback(false)` turns it off for the whole app; `ui.pressDim(h)` tells
the factor applied now (tests: `tests/golden/ui-press`).

## Transitions

Tailwind's transition classes ease a property whenever its value changes after the node's first style, whoever changed it: a class change, a state
variant (`hover:opacity-80`), a style number (`style={{ rotate: deg() }}`), a theme switch. The engine moves the value on each frame; the program runs
nothing per frame.

| Class | Properties |
| --- | --- |
| `transition` | colours, opacity, shadow, transform |
| `transition-colors` | text, border and background colours and their alpha (`bg-black/50`), side colours |
| `transition-opacity`, `transition-shadow`, `transition-transform` | `opacity`; the `shadow-*` level and React Native's shadow keys; translate, scale, rotate, skew |
| `transition-all` | the above and every length: width, height, min/max, padding, margin, gap, border widths, radii, insets, font size, letter spacing |
| `transition-none` | none |

`duration-N` and `delay-N` are milliseconds (150 ms by default; `duration-N` alone transitions every property, as CSS's initial `transition-property: all`);
`ease-linear`, `ease-in`, `ease-out` and `ease-in-out` are Tailwind's curves, and the default is its `cubic-bezier(0.4, 0, 0.2, 1)`. As in CSS: a node's
first style does not transition, a new end set while the property moves starts from the value shown, colours ease channel by channel, keyword values
(`shadow-*` levels) switch half way, and a length that is `auto` or unset at either end jumps. Opacity, transform, colour and shadow transitions are
paint-only: no layout runs while they move (`tests/golden/ui-transition`); length transitions lay out on each frame.

`ui.animate(node, key, to, ms, easing, delay)` tweens any key of the style table (the keys of `setNumber`, listed under Style reference below) from the
value it has now: numbers, colours channel by channel, keyword keys half way; `ui.getNumber(node, key)` reads a key's value, while it moves too. An
animation takes its property over from a transition. Profiles with a heap of 256 KiB or less (ESP32, PS1) run at most 8 tweens at once, transitions
and animations together: a change beyond that takes its end at once.

The opaque text and border colours of `hover:`, `focus:`, `active:` and `focus-within:` (the state colours resolved where the node is painted) switch
at once; their background colour eases.

## Gradients

Tailwind v4's background gradients and CSS gradient functions (ZN-261):

| Class | Gradient |
| --- | --- |
| `bg-linear-to-t` ... `bg-linear-to-tl` (`bg-gradient-to-*` too) | towards a side, or a corner (`tr`, `br`, `bl`, `tl`: the angle follows the box, as CSS's `to top right`) |
| `bg-linear-45`, `-bg-linear-45` | at an angle in degrees (0 to the top, 90 to the right) |
| `bg-radial`, `bg-radial-[at_25%_25%]` | an ellipse around the centre (farthest corner), or the CSS arguments in brackets |
| `bg-conic`, `bg-conic-180`, `bg-conic-[from_45deg_at_25%_50%]` | around the centre, clockwise from the top, from an angle |
| `bg-linear-[25deg,red_5%,yellow_60%,lime_90%,teal]` | CSS arguments: a direction or angle and colour stops (`_` for spaces) |
| `bg-[linear-gradient(..)]`, `bg-[radial-gradient(..)]`, `bg-[conic-gradient(..)]`, `bg-[repeating-linear-gradient(..)]` ... | a whole CSS gradient |
| `from-*`, `via-*`, `to-*`; `from-10%`, `via-30%`, `to-90%` | Tailwind's stops: colours (with `/alpha`, `transparent`) and positions (0%, 50%, 100% by default; a missing one is transparent) |
| `bg-none` | no gradient |

Style objects take `backgroundImage` (React Native's `experimental_backgroundImage` too, or `background`) with a CSS gradient:
`{ backgroundImage: 'linear-gradient(135deg, #f43f5e, #8b5cf6 60%, #06b6d4)' }`; it is lowered to the `bg-[..]` class at build time.

CSS arguments: angles in `deg`, `turn`, `rad`, `grad`; `to <side> [<side>]`; radial shape (`circle`, `ellipse`), size (`closest-side`,
`closest-corner`, `farthest-side`, `farthest-corner`, one or two lengths or percentages) and `at <position>` (keywords, percentages, px); conic
`from <angle>` and `at <position>`; stops with one or two positions (`#000 0 10px`: a hard stripe), percentages, px, and angles in a conic.
Colours are CSS names, `#hex`, `rgb()`, `hsl()`, `var(--x)`, `transparent` and Tailwind names (`red-500/50`); colour hints are skipped and the
interpolation space (`in oklab`, `/oklch`) is accepted but colours are interpolated in sRGB. A transparent stop takes the colour of its neighbours,
as premultiplied interpolation shows it, and the background colour is painted under a gradient that lets it through.

The painter draws a gradient along an axis whose stops share one alpha as chained two-stop rects (the prototype's `gradient` command, exact on every
profile), and everything else as one `gfx.gradientPaint` command: a paint record the software raster evaluates per pixel and the GL replay in its
shader (eight stops and fewer; more come from a CPU tile). The `bg-gradient-to-*` boxes with `from-*` and `to-*` keep their one command. Profiles
below tier T2 (`targets/capabilities.json`: ESP32, PS1, PS2) keep two stops along an axis and below T3 draw no conic: a gradient beyond that is drawn
from its first to its last colour along the nearest axis, a conic as the average of its stops, with one log line each. Per-corner radii
(`rounded-tl-*`) are not followed by a gradient: it takes the box's radius. The golden is `tests/golden/style-gradient` (`tests/t1/style_gradient.sh`).

## Images in a box

`<Image src="logo.png" />` shows an image of the assets; `<Image image={img} />` shows a runtime image: one decoded with `imageFromBytes`, built
with `imageFromPixels`, or handed by a plugin (a cover, a camera frame). It follows a signal like any prop; the program keeps the
image and calls `destroyImage` once no node shows it.

How an `<Image>` fills its box, and background images on any node (ZN-262), with Tailwind v4's names and CSS's geometry:

| Class | Style key | Effect |
| --- | --- | --- |
| `object-fill` (default), `object-contain`, `object-cover`, `object-none`, `object-scale-down` | `objectFit`; React Native's `resizeMode` (`stretch`, `contain`, `cover`, `center`, `repeat`), also an attribute: `<Image resizeMode="cover">` | the image stretched, inside the box, covering it (cut), at its own size, or at its own size unless larger. `center` is `scale-down`; `repeat` tiles the image from the top left at its size, scaled down when larger than the box |
| `object-center` (default), `object-top`, `object-top-left`, `object-left-bottom` ..., `object-[25%_75%]`, `object-[10px_0]` | `objectPosition: '25% 75%'` | where the image sits in the free space: keywords, percentages of the free space, px |
| `bg-[url(hero.png)]` | `backgroundImage: 'url(hero.png)'` | an image of the assets (as `image()` names it; quotes and a leading `/` are dropped) behind the content |
| `bg-auto` (default), `bg-cover`, `bg-contain`, `bg-size-[50%_auto]`, `bg-size-[32px]` | `backgroundSize` | the tile size: its own, cover, contain, or one or two lengths (`auto` keeps the image's ratio) |
| `bg-top-left` (default) ... `bg-center`, `bg-position-[10px_20%]` | `backgroundPosition` | where the first tile sits, as `object-*` |
| `bg-repeat` (default), `bg-no-repeat`, `bg-repeat-x`, `bg-repeat-y`, `bg-repeat-space`, `bg-repeat-round` | `backgroundRepeat` (`space`, `round` too) | tiles along both axes, none, one axis; `space` spreads whole tiles from edge to edge, `round` stretches them to a whole number |
| `tint-sky-500`, `tint-[#80c0ff]` | `tintColor` | multiplies the colour of the node's images (`<Image>` and background): white and grey pixels take the tint, as React Native's `tintColor` does for template icons |

A background image is painted over the background colour and under a gradient (`bg-[url(photo.png)] bg-cover bg-linear-to-b from-transparent
to-black/60`: a scrim over a photo); the whole box is its positioning and painting area, rounded by the box's radius. `bg-none` removes it.

Each tile is one `drawImageRect` of the part of the image inside the box, its edges on whole pixels so that no seam shows; a rounded box adds a
clip around them. An `<Image>` that only stretches keeps the prototype's one `drawImage` command. The command budget bounds the tiles: 16 on tier T0
(ESP32), 64 on T1 (PS1), 4096 above, and never more than the commands left in the frame. Past it the box is drawn with fewer, larger tiles laid
exactly over it (about the tiles' shape), with one log line. The tint is the raster's multiply on every renderer (the GL replay multiplies the texel
by the vertex colour, within a few units). The golden is `tests/golden/style-image` (`tests/t1/style_image.sh`).

## Keyboard

```tsx
<View focusable onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Delete') removeSelected(); }}>...</View>
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
<View className="grow overflow-hidden" onWheel={zoomAt} onPointerDown={startPan} onPointerMove={pan} onPointerUp={endPan}>
  <View ref={world} className="absolute left-0 top-0 w-[2000] h-[2000]" style={{ scale: zoom(), translateX: panX(), translateY: panY() }}>
    <For each={nodes()}>{(n: GNode) => <Card node={n} />}</For>
  </View>
</View>
```

Zoom around the pointer: `wx = (e.x - panX) / z`, then `panX = e.x - wx * z2` (same for y). Text in a scaled view
(a `scale`, a `transform` with an even scale, a `scale-*` class) keeps the line breaks and the widths of its layout,
times the scale, and is drawn with glyphs made for its size on screen (`zinc:gfx` under `setTransform`,
[UI apps](guide/03-ui-apps.md)): it stays sharp at every zoom and no word changes line while a view grows.
(`scale` on a `<Text>` keeps its legacy meaning: font size 8 × scale.)

## Scrolling

Scroll containers (`<ScrollView>`, `overflow-y-auto` / `overflow-x-auto`) run one physics state per axis in
`lib/std/ui.ts` (`ScrollAxis`), with the constants of the reference implementations:

| phase | behaviour |
| --- | --- |
| direct | fingers move the content 1:1; past an edge the shown offset is the closed-form rubber band `(1 - 1/(x·0.55/dim + 1))·dim` of the raw overscroll (UIScrollView) |
| release | velocity = least-squares slope of the last 100 ms (0 if the fingers rested > 40 ms, like Flutter's VelocityTracker), capped at 8000 px/s |
| inertia | `v·0.998^ms` (iOS normal deceleration); an edge reached hands the velocity (≤ 5000 px/s) to the bounce |
| bounce | critically damped spring toward the edge, ω = 10/s (iOS / GTK overshoot) |
| wheel | notches: a critically damped spring toward 48 px per notch, retargeted while turning; with reduced motion the offset jumps |
| momentum | macOS: after the lift the content follows the OS momentum's deltas 1:1 (macOS's own inertia, nothing added); an edge reached hands their velocity to the bounce and drops the rest; fingers landing stop it |

On Android (`ui.platformStyle()` 'android', `ZINC_PLATFORM=android` on the desktop) the physics are Android's (`lib/std/overscroller.ts`):

| phase | behaviour |
| --- | --- |
| direct | the content stops at the edge; a pull past it **stretches** the content (Android 12+, at most 8 % of the viewport, drawn by spreading the children from the pulled edge) or lights the **glow** (Android 11 and before) |
| release | a fling above 50 px/s (ViewConfiguration) follows `OverScroller`'s spline: duration `1000·e^(l/(2.358-1))` ms and distance `0.015·C·e^(2.358/(2.358-1)·l)` with `l = ln(0.35·v/(0.015·C))`, `C = 9.80665·39.37·160·0.84` (AOSP's constants) |
| edge | a fling that reaches an edge stops there and turns a quarter of its velocity into a stretch |
| release of a stretch | EdgeEffect's spring back (stiffness 200, damping 0.98) |
| scrollbars | shown 300 ms after the last move, then a 250 ms fade (iOS and the desktop: 800 ms and 400 ms) |

`tests/t1/scroll_platform.sh` runs one script of fingers under each platform and keeps every frame's offset and stretch.

`<ScrollView stickToBottom>` follows its end (a chat, a log): while it shows the end, it keeps showing it as the content grows or the view is resized;
once the user scrolls up it stays where it is, and it follows again when brought back to the end (`ui.scrollTo(h, 0, 1e9)` from code).

Input: the SDL HAL resamples the precise deltas at frame time (now - 5 ms, linear between events, extrapolation ≤ 8 ms:
Chromium / Android) into `HalInput.scroll_dx / dy / phase` (`gfx.scrollDX / scrollDY / scrollPhase`). On macOS the main
window's precise scrolls (trackpad, Magic Mouse) come from their NSEvents (`targets/macos/hal_cocoa.mm`) with the gesture
and momentum phases: the lift is exact for both devices (phase 4), and the OS momentum that follows is passed on as
phase 5, followed as it is instead of an inertia of the engine, so a fling feels like any Mac app. Fingers resting on
the pad (`MayBegin`, phase 3) stop it; 100 ms without a momentum delta after the lift and the scroll rests. Elsewhere
(Linux, devices without phases, other windows) the HAL reports trackpad fingers (`SDL_HINT_TRACKPAD_IS_TOUCH_ONLY`) to
know the lift, or a 50 ms gap ends the gesture, and the engine's inertia runs (phase 2), the physics of touch screens
and of `tests/conformance/scroll_physics.tsx`. A gesture stays on the scroller under the pointer when it starts (the
innermost that scrolls that way; at its end it rubber-bands, it does not hand over to an enclosing one), and its
momentum too. `ui.scrollBy(h, dx, dy)` moves an offset without stopping a scroll in progress (rows inserted above what is
shown, as `examples/agents` does when it reads older items). `tests/t1/scroll_momentum.sh` scripts a gesture, its
momentum, a catch, a momentum into the end and wheel notches with ZINC_INPUT `scroll DX DY PHASE`.

## Platform and system signals

`platform()` (zinc:sys) answers `android` and `ios` on the phones, `macos` and `linux` on desktops; `ZINC_PLATFORM=android|ios|macos|linux`
forces it, at run time and for the compiler (zinc:platform `TARGET`, the `x.android.ts` / `x.ios.ts` files next to `x.ts`), so a phone's
behaviour runs and is tested on the desktop. `ui.platformStyle()` is `android`, `ios` or `desktop`: the scroll physics, the navigation
transitions and the selection handles follow it; the kits' look follows "Platform look" below.

What a phone's OS tells an app reaches zinc:ui as **signals**, one line each, `kind args`, taken at the start of a frame
(`gfx.signalCount` / `signalNext`, queued by `src/host/hal_dispatch.cpp`):

| signal | from | effect |
| --- | --- | --- |
| `safearea T R B L` | SDL (`SDL_GetWindowSafeArea`, at start and on change) | `env(safe-area-inset-*)`, `ui.safeArea()`, React Native's `SafeAreaView` |
| `theme dark\|light` | SDL (`SDL_GetSystemTheme`, `SDL_EVENT_SYSTEM_THEME_CHANGED`) | `setScheme('auto')` follows it; React Native's `Appearance` |
| `fontscale K` | Android `Configuration.fontScale`, iOS Dynamic Type | `ui.systemFontScale()`: rem, text classes and `fontSize` scale by it (the nearest baked size) |
| `reducemotion 0\|1` | Android animator scale 0, iOS Reduce Motion | `ui.prefersReducedMotion()`: transitions become fades |
| `keyboard H` | Android IME insets / visible frame, iOS keyboard frame, SDL (hidden) | `ui.setKeyboardInset`: the focused field is revealed, `env(keyboard-inset)`, React Native's `Keyboard` |
| `back` | Android back key (SDL, trapped) and `OnBackInvokedCallback` | the back handlers (`ui.addBackHandler`, React Native's `BackHandler`), newest first; none takes it: the app goes back to the system |
| `backstart left\|right`, `backprogress P`, `backcancel` | Android 14 predictive back (`OnBackAnimationCallback`) | the navigation stack's predictive back |
| `orientation portrait\|landscape` | SDL | listeners only (rotation is a resize) |
| `background`, `foreground` | SDL's lifecycle (home, another app, the screen locked; the return) | `ui.appState()`: nothing is drawn in between; listeners hear `background` before the app stops (the moment to save; React Native's `AppState`) |
| `compose TEXT`, `commit TEXT`, `imedelete B A`, `imeselect S E`, `imeaction NAME` | SDL `SDL_EVENT_TEXT_EDITING`, the text input connection | see "Text input on phones" |
| `a11y 0\|1`, `a11yactivate ID`, `a11yfocus ID`, `a11yscroll ID 1\|-1` | VoiceOver, TalkBack and the other accessibility clients | see "Screen readers" |

`ui.addSignalListener((kind, args) => ...)` sees each one after zinc:ui applied it; `ui.systemSignal(line)` sends one. A test sends them
with a `ZINC_INPUT` script, `<frame> safearea 47 0 34 0` (or `safe-area`), `<frame> theme dark`, `<frame> back`, `<frame> background`, and `<frame> rotate`,
which turns a headless surface a quarter (a resize and the orientation signal) and asks a phone's OS to turn the screen (`tests/t0/system_signals.sh`).
On a phone the program draws under the status and navigation bars (edge-to-edge): it pads by the safe area (`SafeAreaView`, `useSafeAreaInsets`,
`env(safe-area-inset-*)`); the safe area is what the bars, the notch and the cutout cover, not the gesture zones.

The other way, the program asks the OS through zinc:sys `device()`: `haptic` (zinc:haptics `Haptics.impact('light')`, `selection()`,
`notification('error')`; React Native's `Vibration`), `statusbar` (React Native's `StatusBar`), `exitapp`, `keyboard-traits` and `textinput`
(the text input connection), `a11y` (the screen reader's tree). The Android activity (`src/app/android/java`) and the iOS glue (`src/app/ios_glue.mm`) do them; a desktop
does nothing, and `ZINC_DEVICE_LOG=file` writes each call to the file.

## Text input on phones

A phone's keyboard reads the field it types into: the text around the caret, the selection, the run it is composing. zinc:ui keeps that
**input connection** with a platform-neutral seam:

- **To the OS**, through zinc:sys `device()`: `keyboard-traits` when a field takes the focus (`type=text|number|decimal|phone|email|url|search
  secure=0|1 multiline=0|1`, and what `ui.setInputTraits(h, ...)` adds: `cap=none|sentences|words|characters autocorrect=0|1
  return=done|go|next|search|send autofill=<hint> maxlength=N`; React Native's `TextInput` sets them from `keyboardType`, `secureTextEntry`,
  `multiline`, `autoCapitalize`, `autoCorrect`, `returnKeyType`, `textContentType` / `autoComplete`, `maxLength`), and on a phone `textinput`
  after each change: `caret anchor compA compB` and the value on the next line. The desktop's window HAL starts SDL's text input with the traits.
- **From the OS**, as signals: `compose TEXT` (the composing run, in the value, underlined, replaced by the next one), `commit TEXT` (replaces
  it), `imedelete BEFORE AFTER`, `imeselect START END`, `imeaction NAME` (the return key: Enter). SDL's `SDL_EVENT_TEXT_EDITING` is a
  `compose`, so a desktop IME composes in the field too (`SDL_HINT_IME_IMPLEMENTED_UI`).
- **The clients**: on Android `ZincEdit` (`src/app/android/java/org/libsdl/app`) replaces SDL's hidden editor with an `InputConnection` over a
  mirror of the field; on iOS `ZincTextInput` (`src/app/ios_glue.mm`) is a `UITextInput` view in SDL's text field's place. Typing on
  Gboard (API 37 emulator) and on the iOS 26 simulator's keyboard, deleting and the keypads of `keyboardType` are proven
  (`docs/reports/zinc-next-android.md`, `zinc-next-ios.md`); a field losing the focus hides the keyboard (`keyboard-traits` with nothing). A
  real IME's composition (Japanese, Chinese), swipe typing, dictation and a password manager are checked in the cross-platform pass.

Touch selection, drawn by zinc:ui in the platform's style: a finger's long press (500 ms) on a field selects the word under it and shows the
**handles** (iOS: a bar with a knob; Android: teardrops) and the **edit menu** (Cut, Copy, Paste, Select All; iOS: a dark capsule, Android: a
white card). Dragging a handle moves that end under a **magnifier** (the line at 1.25x above the finger). A mouse keeps the desktop's selection.
`ui.touchSelection()`, `ui.selectionHandles()` and `ui.editMenuRects()` tell tests where they are (`tests/t1/text_touch.sh`). With the
on-screen keyboard's height (the `keyboard` signal) the focused field is scrolled above it.

## Screen readers

The accessibility tree `ui.inspect()` prints (roles, labels, `aria-hidden`, disabled; a plain box that takes clicks, such as React Native's
`Pressable`, is a `button`; open layers follow the tree and a modal one hides it) reaches the phone's screen reader: **VoiceOver** (and Switch
Control, Voice Control, XCUITest) through `UIAccessibilityElement`s of a container over SDL's view, **TalkBack** (and every accessibility
service, `uiautomator`) through an `AccessibilityNodeProvider` on SDL's surface. Nothing is sent while no reader listens: the host says when
one does (`a11y 1`: VoiceOver or Switch Control running, `AccessibilityManager.isEnabled()`, or a client reading the tree).

- **To the OS**, after each painted frame, only what changed (zinc:sys `device('a11y', lines)`): `n ID PARENT FLAGS X Y W H\tROLE\tLABEL\tVALUE\tHINT`
  for a node new or changed (the box on the surface in logical pixels, cut by its scroll areas; flags 1 disabled, 2 takes clicks, 4 checkable,
  8 checked (`aria-checked`), 16 editable, 32 selected (`aria-selected`), 64 off screen, 128 focused, 256 scrolls; VALUE is a field's text or
  `aria-valuetext` / `aria-valuenow`, HINT its placeholder), `d ID` for a node gone, `o ID...` for the reading order.
- **From the OS**, as signals: `a11yactivate ID` (VoiceOver's double tap, TalkBack's ACTION_CLICK: a field takes the focus, a button is
  pressed), `a11yfocus ID` (the reader's cursor: the node is scrolled into view), `a11yscroll ID 1|-1` (a page on or back).
- On iOS a node that takes clicks holds its descendants, as a `UIButton` holds its label; on Android TalkBack reads a button's text children
  itself. `ZINC_INSPECT=N` prints `ui.inspect()` at frame N; `tools/a11y-tree` puts the tree, the log of what was sent and the platform
  dumps in one form to diff them. Details and proofs: docs/reports/zinc-next-a11y-bridges.md; `tests/t0/ui_a11y_bridge.sh`.

## Semantic hints and Form (the web page)

On the web target with `--render dom` (docs/targets/web.md, "The semantic DOM") the tree becomes real HTML: the tag, the roles and the attributes of an element come from the node, and a few
optional attributes tell the page more than a desktop needs. They are stored with the node (`ui.setAttr`) and every other target ignores them, so one source runs everywhere.

```tsx
<View as="header" className="flex-row items-center gap-4 px-6 py-3">
  <Text as="h1" className="text-xl font-bold">Orders</Text>
  <View as="nav" aria-label="Main" className="flex-row gap-3">
    <Text as="a" href="/orders" className="text-sm">All</Text>
  </View>
</View>
<ScrollView as="main" aria-label="Content">
  <View as="ul">{rows.map((r) => <View as="li" key={r.id}>...</View>)}</View>
  <Form onSubmit={save} name="login">
    <Input name="email" type="email" autoComplete="email" required value={email()} onInput={setEmail} />
    <Input name="password" type="password" autoComplete="current-password" minLength={8} value={pw()} onInput={setPw} />
    <Button label="Sign in" type="submit" />
  </Form>
</ScrollView>
```

| Hint | What it does in the page |
| --- | --- |
| `as="nav"`, `"main"`, `"header"`, `"footer"`, `"aside"`, `"section"`, `"article"`, `"ul"`, `"ol"`, `"li"`, `"p"`, `"h1"` to `"h6"`, `"a"`, `"button"`, `"label"`, `"form"`, `"fieldset"`, `"table"`, `"tr"`, `"td"`, `"details"`, ... | the element the node is (any tag of the list in `targets/web/dom.js`; it wins over the default) |
| `role="navigation"`, `"main"`, `"banner"`, `"contentinfo"`, `"complementary"`, `"region"`, `"form"`, `"list"`, `"listitem"`, `"article"`, `"link"`, `"button"`, `"heading"` (with `aria-level`) | the element with that meaning (`nav`, `main`, `header`, `footer`, `aside`, `section`, `form`, `ul`, `li`, `article`, `a`, `button`, `h1` to `h6`); any other role is a `role` attribute. `accessibilityRole` is `role` (React Native's name) |
| `aria-label`, `accessibilityLabel`, `aria-*`, `data-*` | attributes of the element; `aria-checked`, `aria-selected`, `aria-expanded`... also drive the `aria-checked:` and `data-[state=open]:` variants |
| `href`, `target`, `rel`, `download` | a real link (`<a>`); its `onClick` still runs, and a link with an `onClick` does not navigate by itself |
| `name`, `type` (`email`, `number`, `tel`, `url`, `search`, `date`, ...), `autoComplete`, `required`, `pattern`, `minLength`, `maxLength`, `min`, `max`, `step`, `enterKeyHint`, `inputMode`, `spellCheck`, `autoCapitalize`, `autoCorrect`, `multiple`, `accept`, `form` | the attributes of the `<input>` or `<textarea>`: the browser's validation, autofill, password managers and soft keyboards read them |
| `title`, `alt`, `lang`, `dir` | the attributes of the same names (an `Image`'s `alt` is its `aria-label`) |
| `tabIndex`, `focusable`, `disabled`, `aria-hidden` | `tabindex`, focusability, `disabled` / `aria-disabled`, `aria-hidden` |

Without a hint the page picks by what the node is: `Text` is a `span`; `Button` and a `View` or `ScrollView` with `onClick` that holds no other control is a `<button type="button">`;
`Image` is an `<img>`; `Input` and `TextArea` are `<input>` (its `type` from `password`, `inputMode` or `type`) and `<textarea>`; a `ScrollView` is a keyboard-focusable scroller; a modal layer is a
`<dialog>`; a `Canvas` is a box that holds a `<canvas>` (or an inline `<svg>` when all it draws is one SVG, as an icon does). The kit's components carry their roles: `Switch` (`switch`,
`aria-checked`), `Slider` (`slider`, `aria-valuenow`), `Tabs` (`tablist`, `tab`, `aria-selected`), `List` and `ListItem` (`ul`, `li`), `Alert` (`alert`), `Progress` (`progressbar`), `Separator`,
`Avatar` (`img`), `CardTitle` (`h3`), `Dialog` (`dialog`, named by its title, with an `h2`).

### Form

`Form` (`zinc:ui/kit`, and React Native's `Form` in `zinc:react-native`) is a column of fields submitted as one. `<Form onSubmit>` is a node with an `onSubmit` handler (`ui.onSubmit(h, f)`, the JSX attribute
`onSubmit` on any host element):

- **On a desktop, a phone or a canvas render**: Enter in a single-line field runs the nearest `onSubmit` above it (the field still commits its value first); a `type="submit"` button is a plain button
  with its own `onClick`.
- **On the page**: it is a real `<form>`. Enter in a field asks the browser to submit it, which first checks `required`, `pattern`, `minLength`, `type="email"`..., shows its own messages and
  focuses the first bad field, and only then runs `onSubmit` (`submit` event, default prevented: the page does not navigate). A `type="submit"` button submits it too. Password managers and autofill see
  the form, the fields' `name` and `autoComplete`.

`TextInput` (React Native) takes `name`, `required`, `pattern`, `minLength`, `maxLength`, `autoComplete`, `enterKeyHint`, `keyboardType` and `secureTextEntry` (a `type="password"` field).

## Navigation stack

`zinc:ui/navigation` is a stack navigator in the React model, shaped like React Navigation's native stack:

```tsx
import { Stack, Route, Navigation } from 'zinc:ui/navigation';
function Page(r: Route, nav: Navigation): i32 { /* r.name, r.title, r.params */ return <Pressable onPress={() => nav.push('detail', 'Detail', 7)}>...</Pressable>; }
<Stack initial="home" initialTitle="Inbox" renderScreen={Page} largeTitle={true} />
```

`nav.push(name, title, params)`, `pop()`, `replace(...)`, `popToTop()`, `present(...)` (modal), `canGoBack()`. Lower screens stay mounted
(state and scroll kept). The transitions follow `ui.platformStyle()` (or `style="ios"|"android"`):

| | iOS (and the desktop) | Android |
| --- | --- | --- |
| push / pop | the new screen slides in from the right in 350 ms (cubic ease out), the previous one moves a third of the way left under a 10 % dimming | Material's shared X axis in 300 ms: a 30 px slide and a fade through |
| back gesture | an edge swipe (the left 24 px) moves the screen with the finger; past the middle, or thrown right faster than 500 px/s, it completes, otherwise it returns | the back key and gesture pop (the back handlers); Android 14's predictive back shrinks the screen toward 90 % and leans it the gesture's way while the finger moves (`backstart`, `backprogress`, `backcancel`), then commits or returns |
| header | a chevron with the previous title in the tint, the title centred, a large title (34 px bold) on the first screen with `largeTitle` | an arrow, the title on the left (22 px) |
| present | a sheet over a scrim (React Native's `Modal`), dismissed by dragging its grabber down a quarter of the screen | a full-screen dialog with a back arrow |

On the web target a `path` prop (`path={(r) => '/' + r.name}`) keeps the address bar and history in step with the screens, and the browser's Back button pops the screen (docs/targets/web.md, "The semantic DOM").

With reduce motion (`ui.prefersReducedMotion()`) both become a 200 ms cross-fade. The motion runs in a stepper on the screens' own nodes:
a transition re-renders nothing. `tests/t1/navigation.sh` drives a push and a pop, the swipe completed and cancelled, the back key, predictive
back and both modal styles under `ZINC_PLATFORM=ios|android`, and keeps the hashes of the frames at the start, middle and end of each.

## Platform look

A program feels native in two layers, as Flutter splits them (`docs/reports/native-fidelity-and-plugins.md` 4.2):

- **Behaviour** follows the platform the program runs on (`ui.platformStyle()`, `ZINC_PLATFORM`) and is not themeable: the scroll physics
  (iOS's rubber band and deceleration on iOS, macOS and the desktop; Android's spline fling and stretch), the page transitions of
  `zinc:ui/navigation`, the selection handles and edit menu, a long press that opens the kit's `ContextMenu` on a touch screen (a right click
  on a desktop), and the haptics the OS's own controls give: a light impact when a switch flips and a selection tick when a segmented
  control moves on iOS, the long-press feedback on Android and iOS (`toggleFeedback`, `selectionFeedback`, `longPressFeedback` of
  `zinc:ui/platform`).
- **Look** is data, the token tables of `lib/std/platform/tokens.ts` (`zinc:ui/platform`): control heights and radii, the switch, slider and
  segmented-control shapes, the type scale, the UI font and the control colours (light and dark), which the kits read.

| | iOS | Android (Material 3) | macOS | neutral |
| --- | --- | --- | --- | --- |
| buttons | 44 px, radius 12, 17 px semibold | 40 px, fully rounded, 14 px medium | 24 px, radius 6, 13 px | the kit's own (h-9, rounded-md, text-sm) |
| switch | 51 x 31, thumb 27, green | 52 x 32, 2 px outline, thumb 16 off and 24 on, primary | 38 x 22, thumb 20, accent | 36 x 20 |
| slider | 4 px track, white 28 px thumb | 4 px track, 20 px thumb in the primary | 4 px track, white 20 px thumb | 6 px track, ringed 16 px thumb |
| segmented (kit `Tabs`) | grey track, raised white segment | outlined, the selected one filled | 22 px, raised segment | the kit's own |
| type (body, title 1) | 17, 28 | 16, 28 | 13, 22 | 16, 24 |
| tint | systemBlue 007aff / 0a84ff | 6750a4 / d0bcff | the user's accent (System Settings) | the kit theme's |
| `ActivityIndicator` | 12 bars | a turning arc | 12 bars | 12 bars |
| font | SF Pro Text | Roboto | SF Pro Text | Inter |

Who reads what:

- **zinc:ui/kit** takes the sizes, shapes, type scale and font, and, while the app keeps the kit's own theme, the platform's colours for the
  filled button, the switch and the slider. An app that sets a theme of its own (`setTheme(myTheme)`) keeps its colours on the platform's shapes.
- **zinc:ui/nuxt** keeps Nuxt UI's colours, sizes and variants (a brand kit) and takes the platform's switch shape, the behaviour and the font.
- **zinc:react-native** draws `Switch`, `Button` and `ActivityIndicator` as each platform does (React Native's own `Button.js`: a tinted title on
  iOS, a raised `#2196f3` rectangle with an upper-case title on Android, a push button on macOS); props (`trackColor`, `color`...) still win.
  Under the neutral look they draw iOS's, as they always did.

**Choosing.** "auto" is the platform's look: iOS on iOS, Android on Android, macOS on a Mac, neutral on Linux, the web and the boards.
One switch forces one look for every kit:

```json
{ "ui": { "platformLook": "auto" } }      // "ios" | "android" | "macos" | "neutral"
```

`ZINC_PLATFORM_LOOK=ios` does the same for one run; in code, `setPlatformLook('android')` before the first render, or
`<ThemeProvider look="neutral">` from `zinc:ui/platform` at the root of the app. The look does not change the behaviour: `ZINC_PLATFORM=android`
runs Android's look and behaviour on the desktop, `platformLook` only its look. A deterministic run (tests, `zinc test`, the pixel goldens) on a
Mac without `ZINC_PLATFORM` takes the neutral look, so it draws the frames a Linux machine draws.

The look's colours are scheme variables (`bg-[var(--pfTint)]`, `pfSwitchOn`, `pfFill`, `pfBorder`...): they follow `setScheme` and a new accent
(`setAccent(0xff2d55)`) without a render; `look()`, `tint()` and `color([light, dark])` give them to code. The fonts are the families the app
ships (`assets/Roboto-Regular.ttf`): the OS's own font files (SF Pro, Android's Roboto) are variable fonts the rasterizer cannot read yet, so
without them the text stays in Inter. `tests/t1/platform_look.sh` keeps a frame per profile of the kit gallery and of rn-showcase (its
components, and a finger pulling the page past its top: rubber band or stretch), and checks the switch, the haptics and the long press.

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

More windows (ZN-663): `hal_win_open`, `hal_win_close`, `hal_win_state`, `hal_win_input`, `hal_win_present` and `hal_win_current`
(weak defaults: the main window only). The SDL3 HAL routes each event to its window by id; the runtime draws a window's frame
between `beginWindow` and `endWindow` into pixels of its own. zinc:ui's `mountWindow(title, w, h, root, background)` gives a tree
its window: the surface state (root, focus, hover, overlays, layers, gestures) is exchanged around that window's frame, and a change
one window makes redraws the others ([guide](guide/03-ui-apps.md#more-than-one-window)).

Not done yet: IME composition preview (committed text works), comments spanning lines in `tsHighlight` (use
`setHighlightAt` with a per-line state, as `examples/zed-editor` does), multiple carets, word-wise drag
selection after a double click, exact-size fonts for continuous zoom.

## Icons

`zinc:icons` draws the [Lucide](https://lucide.dev) set (1848 icons, ISC, pinned in `third_party/lucide`) through `zinc:svg`:

```tsx
import { Icon, icon } from 'zinc:icons';
<Icon name="heart" size={20} color={() => theme().accent} strokeWidth={2} />
```

Only the icons a project names are compiled in: the compiler collects `<Icon name="...">` and `icon('...')` with literal names from the project's
sources, plus `zinc.json` `"icons": ["compass", "moon"]` for names decided at run time (`["*"]` compiles the whole set). `icon(name, color, strokeWidth)`
returns the parsed `Svg` (cached) or null for a name that was not compiled in; `iconNames()` lists them.

## Animated (React Native's API)

`zinc:ui/animated` is React Native's `Animated`: `Value`, `ValueXY`, `timing` (default easing `Easing.inOut(Easing.ease)`, 500 ms), `spring`
(tension/friction, bounciness/speed or stiffness/damping/mass), `decay`, `interpolate` (ranges, `extrapolate` clamp/identity/extend, `colors: true` for
0xRRGGBB outputs), `add`/`subtract`/`multiply`/`divide`/`modulo`/`diffClamp`, `sequence`, `parallel`, `stagger`, `delay`, `loop`, and `Easing`. The maths
are ports of React Native 0.76 (MIT) and give its values (tests/t1/animated.sh compares with numbers computed by React Native's own code).

```tsx
import * as A from 'zinc:ui/animated';
const fade = new A.Value(0);
A.spring(fade, { toValue: 1, bounciness: 6 }).start();
<View style={{ opacity: fade.get(), translateY: (1 - fade.get()) * 20 }} />
```

Values are signals: a style reads them with `.get()` and the node follows. Animations advance on the engine clock (deterministic in tests, `ui.tick`).
`useNativeDriver` is accepted; running transform and opacity animations without the program's code each frame is ZN-364.01.
In the React model, `useAnimated(value)` of `zinc:react-native` returns the value's number and renders the component again when it moves
(React Native's Animated.View does this for its style): `const x = useAnimated(pan.x)` then `transform: [{ translateX: x }]` (examples/rn-tester).

## Right to left

`ui.setDirection('rtl')` (or `ZINC_DIR=rtl`) lays the whole surface out from the right, like `<html dir="rtl">`, in both layout engines: rows run from the
right edge, a column's start (and its children that are not stretched) is on the right, text without an explicit alignment starts on the right. The logical
classes `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `rounded-s`, `rounded-e`, `border-s`, `border-e`, `text-start`, `text-end` and the `rtl:` / `ltr:`
variants follow it (switching restyles the nodes that use them). Absolute insets and the physical classes (`ml-`, `left-`, `text-left`) stay physical.
`ui.direction()`, `ui.isRtl()`; React Native's `I18nManager.forceRTL` / `isRTL` map onto them.

## Layout engines

`zinc.json` `"ui": {"layout": "classic" | "rn" | "auto"}` picks the engine: `classic` (the default, every demo) or `rn` (Yoga 3.2.1, React Native's
layout). `"ui": {"preset": "react-native"}` asks for `rn` and React Native's style semantics: `flex: n` is grow n, shrink 1, basis 0 (equal shares) and text
is black by default. On a target without Yoga (esp32, ps1) the preset falls back to `classic` with the same semantics, where `flexShrink`, `flexBasis`,
`minWidth/maxWidth` (a growing item is frozen at its limit and the others share the rest), `alignSelf`, `aspectRatio` and `alignContent` also work; an
explicit `"layout": "rn"` on such a target is a build error, except on the web, where it means the same as the preset (the browser has its own layout; there is no Yoga there, see
`docs/targets/web.md`). Programs read the choice as `UI_LAYOUT` and `UI_PRESET` of `zinc:platform`.

In `classic`, flex-shrink is opt-in (`shrink`, `shrink-[n]`): in a row too narrow for its children, those with it lose the overflow in
proportion to shrink x width, an item that reaches its `min-w-*` (0 without one) stays there and the others share the rest, as CSS does.
Each shrunk item is then laid out again at the width it gets, and so is a child wider than its column, so the texts in them wrap at
that width and the row takes the height that gives: a pane between two fixed panels wraps its paragraphs inside its own edge
(`tests/golden/classic-shrink`).

## Gestures: PanResponder and Animated.event

`PanResponder.create({ onStartShouldSetPanResponder, onMoveShouldSetPanResponder, onPanResponderGrant, onPanResponderMove, onPanResponderRelease,
onPanResponderTerminate })` (from `zinc:ui`) is React Native's, put on a host element with `{...pan.panHandlers}` (the only spread attribute). It rides
on `onDrag`: with `onStartShouldSetPanResponder` it takes the pointer on the first move, otherwise past the 8 px drag threshold, and the should-set
callbacks are asked once, at that moment. The handlers get `(e, gestureState)`: `e.nativeEvent` has `locationX/Y`, `pageX/Y`, `timestamp`;
`gestureState` has `dx`, `dy` (since the press), `vx`, `vy` (px per ms, from the last move), `moveX/Y`, `x0/y0`, `stateID`, `numberActiveTouches`.
A scroll view's `onScroll` gets `e.nativeEvent.contentOffset` once per frame in which the offset moved.

`Animated.event(mapping, { listener })` returns such a handler: entry 0 of the mapping maps the event
(`[{ nativeEvent: { contentOffset: { y: scrollY } } }]`), entry 1 the gesture state (`[null, { dx: pan.x, dy: pan.y }]`).

```tsx
const pan = new A.ValueXY();
const responder = PanResponder.create({
  onStartShouldSetPanResponder: (e: ui.ResponderEvent, g: ui.GestureState): boolean => true,
  onPanResponderGrant: (e: ui.ResponderEvent, g: ui.GestureState): void => pan.extractOffset(),
  onPanResponderMove: A.event([null, { dx: pan.x, dy: pan.y }]),
  onPanResponderRelease: (e: ui.ResponderEvent, g: ui.GestureState): void => { pan.flattenOffset(); A.decay(pan.x, { velocity: g.vx }).start(); },
});
<View {...responder.panHandlers} style={{ transform: [{ translateX: pan.x.get() }, { translateY: pan.y.get() }] }} />
```

## LayoutAnimation

`LayoutAnimation` (from `zinc:ui`) is React Native's: `LayoutAnimation.configureNext(config, onEnd)` before a state change animates the layout that
change causes. Moved and resized nodes go from their old box to their new one, new nodes fade in, removed nodes stay where they were and fade out
before they leave the tree. Presets: `LayoutAnimation.Presets.easeInEaseOut` (300 ms), `.linear` (500 ms), `.spring` (700 ms, damping 0.4), the
shortcuts `LayoutAnimation.easeInEaseOut()` / `.linear()` / `.spring()`, and `LayoutAnimation.create(duration, type, property)`. Curves: the iOS
ones (`easeInEaseOut`, `easeIn`, `easeOut`), `linear`, `spring`. It works with both layout engines.

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
<View className="w-full" style={[styles.card, active() && styles.selected, { opacity: opacity() }]} />
<Text style={{ fontSize: 24, fontWeight: 'bold', color: 'rgb(15,23,42)' }}>Hello</Text>
```

Named styles can live in an imported `.ts` module or inside a component. Use module scope when the values are
shared and constant. `StyleSheet.create` is a compiler intrinsic: named CSS objects become immutable `Style`
records before type checking/code generation. Arbitrary mutable plain objects are not runtime style dictionaries;
use `StyleSheet.create` to prepare reusable entries. Styles are immutable by convention: do not mutate their arrays.
`StyleSheet.compose(base, override)` and `StyleSheet.flatten(styles)` return a composed `Style`; avoid calling them
on every frame when the composition is constant.

Supported properties:

- Flex layout: `flexDirection` (`row`/`column`/`row-reverse`/`column-reverse`), `flexWrap` (`wrap-reverse` too), `justifyContent`, `alignItems`, `alignSelf`, `alignContent`,
  `flexGrow`/`grow`, `flexShrink`, `flexBasis` (number, percent, `auto`), `gap`, `rowGap`, `columnGap`; a margin side `auto` takes the free space
  of its line (`margin: 'auto'` centres). `flex: n` is React Native's shorthand in the `rn`
  layout mode (grow n, shrink 1, basis 0; `0` rigid; `-1` shrink only) and an alias of grow in `classic`.
- Dimensions: `width`, `height` (numbers, px, percentages, auto, and `pct(v)` for a percent decided at run time), `minWidth`, `maxWidth`,
  `minHeight`, `maxHeight` (px, `none`), `aspectRatio` (`'16/9'` or a number); padding/margin and individual sides, plus
  `paddingHorizontal/Vertical`, `marginHorizontal/Vertical`. String padding/margin use CSS 1–4-value shorthand. Padding, margin, insets, gaps and
  min/max sizes also take a percent of the containing block (`'10%'`) in the `rn` engine; `classic` ignores those.
- Position: `position` (`relative`/`static`/`absolute`/`sticky`, as the classes; React Native's default `relative` under the preset and in `rn`, where `static` ignores insets and
  is no containing block), `boxSizing` (`border-box`, `content-box`: in `rn`), `top/right/bottom/left`, `display` (`flex`/`none`/`contents`: the children take its place),
  `overflow` (`visible`/`hidden`/`auto`/`scroll`). Relative means normal flow; offsets position absolute nodes.
- Paint: `backgroundColor`/`background`, `color`, `borderColor`, `borderWidth`, side border widths (layout space in `rn`, as in CSS and React Native), `borderRadius`,
  `border: '<width> solid <color>'`, React Native's `borderStyle` (`solid`/`dashed`/`dotted`), corner radii (`borderTopLeftRadius`,
  `borderTopRightRadius`, `borderBottomRightRadius`, `borderBottomLeftRadius`) and side colours (`borderTopColor`, `borderRightColor`, `borderBottomColor`,
  `borderLeftColor`: like React Native, a side colour needs a border width), `opacity`, `translateX/Y`, `scale`, and React Native's shadow: `shadowColor`, `shadowOffset: { width, height }`,
  `shadowOpacity` (no shadow while it is 0, React Native's default), `shadowRadius`, and `elevation` (one black shadow: offset e/2, blur 0.8e, opacity
  0.12 + 0.012e up to 0.4). `shadowLevel` (0 to 5) is the look of `shadow-none`, `shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`, `shadow-xl`.
- The outline, outside the border: `outlineWidth`, `outlineColor`, `outlineOffset`, `outlineStyle` (`solid`, `dashed`, `dotted`, `none`), as `outline-2
  outline-red-500 outline-offset-2 outline-dashed`. It replaces the keyboard focus ring; `outlineStyle: 'none'` or `outlineWidth: 0` removes that ring, as
  `outline-none` and `outline-0`.
- Fields and scrolling: `placeholderTextColor` (as `placeholder:text-red-500`), `selectionColor` (as `selection:bg-green-500`, drawn translucent over the
  text; on a selectable Text too), `cursorColor` (the caret, as `caret-red-500`); `showsVerticalScrollIndicator` and `showsHorizontalScrollIndicator`
  (`false` hides that scroll bar; no class, and React Native's ScrollView props of the same names do the same). The web page keeps a bar unless every axis
  of the scroll view hides it (CSS `scrollbar-width` takes both or none).
- Motion: `transitionProperty` (`'all'`, `'none'`, a name or an array of names: `'backgroundColor'`, `['transform', 'opacity']`), `transitionDuration` and
  `transitionDelay` (milliseconds, or `'200ms'`, `'0.2s'`), `transitionTimingFunction` (`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`; the last three
  are the curves of the `ease-*` classes), into the `InterX` fields that `transition-colors duration-200 ease-linear delay-20` write. A name transitions its group, as the
  classes do: the colours, opacity, the shadow, the transform, or the other lengths (sizes, spacing, radii, border widths, insets, `fontSize`,
  `letterSpacing`: what `transition-all` adds). Without `transitionDuration` nothing moves (CSS's 0 s), where the `transition-*` classes take 150 ms.
- Layering and the pointer: `zIndex` (any integer, as `z-10`, `-z-1`), `pointerEvents` (`auto`, `none`: the node and its subtree take no pointer, as
  `pointer-events-none`; `box-none` and `box-only` are refused), `cursor` (`default`, `auto`, `text`, `pointer`, `move`, `ew-resize`/`col-resize`,
  `ns-resize`/`row-resize`, `crosshair`, `grab`, `grabbing`, `not-allowed`, as the `cursor-*` classes).
- React Native's `transform: [{ rotate: '45deg' }, { scale: 1.2 }, ...]` with `translateX/Y`, `scale`, `scaleX/Y`, `rotate`/`rotateZ` (`deg`, `rad`,
  `turn`, or a number of degrees), `skewX/Y`; static or dynamic values. It applies around the centre in one fixed order (translate, rotate, scale, skew; a
  repeated entry keeps the last value) and 3D entries are refused. Hits and paint follow the transformed shape: the node and its subtree, texts and
  icons included, are drawn through the renderer's matrix (an `animate(ref, 'rotate', 360, …)` spins it); a clip under a turn is the bounding box of
  the turned rectangle. Canvas and 3D plugins that record their own commands draw upright inside a turned parent.
- Text: `fontSize`, `fontFamily`, `fontWeight` (`normal`, `bold`, `100` to `900` as `font-thin` to `font-black`: the nearest face the family has),
  `fontStyle` (`normal`, `italic`), `textTransform` (`none`, `uppercase`, `lowercase`, `capitalize`), `textDecorationLine` (`none`, `underline`,
  `line-through`, `underline line-through`, `overline`), `textDecorationColor` (the text's colour by default), `textDecorationStyle` (`solid`, `double`,
  `dotted`, `dashed`; the classes have no equivalent), `textShadowColor` (a shadow, opaque unless the colour has an alpha), `textShadowOffset: { width, height }`,
  `textShadowRadius` (accepted; the shadow is drawn sharp, as the `text-shadow-*` classes draw it), `lineHeight` (absolute units), `letterSpacing` (px), `textAlign`.
  Each key writes the field its class writes (`italic`, `uppercase`, `underline`, `text-shadow-md text-shadow-red-500`...): the same pixels on the native
  renderers (`tests/golden/style-keys`), the same CSS in the web page's DOM.
- Existing numeric aliases remain: `bg`, `radius`, `x/y`, `hidden`, `lazy` (canvas).

CamelCase and quoted CSS kebab-case keys work. Numbers are logical pixels except unitless properties. `rem`/`em`
currently mean 16 logical pixels, not inherited CSS font sizes. Colors accept the named subset in the compiler,
`#RGB`, `#RRGGBB`, `rgb(...)`; `backgroundColor`, `color`, `borderColor`, `shadowColor` and `textShadowColor` also take an alpha (`#RRGGBBAA`,
`rgba(...)`, `transparent`: what `text-white/50` or `border-transparent` give; a shadow colour's alpha multiplies `shadowOpacity`, as in React Native). Static 24-bit colors
are encoded separately from floating/fixed-point values, preserving them on PS1 profiles. Dynamic numeric colors
still follow the target's `number` range; choose conditional named styles for portable color changes.

Dynamic values inside an inline object are numeric Zinc expressions, or (ZN-362) a conditional between literals for a key that takes strings:
`fontWeight: on() ? 'bold' : 'normal'`, `display: open ? 'flex' : 'none'`, `backgroundColor: on() ? '#0f766e' : 'white'`, nested conditionals too. The keys
that take such a conditional: the enum keys (`flexDirection`, `flexWrap`, `justifyContent`, `alignItems`, `alignSelf`, `alignContent`, `position`, `display`,
`overflow`, `fontWeight`, `fontStyle`, `textTransform`, `textDecorationLine`, `textDecorationStyle`, `pointerEvents`, `cursor`, `textAlign`, `outlineStyle`,
`transitionProperty`, `transitionTimingFunction`), the colour keys (`backgroundColor`/`bg`, `color`, `borderColor`, `shadowColor`, `textShadowColor`,
`textDecorationColor`, `outlineColor`, `placeholderTextColor`, `selectionColor`, `cursorColor`: each literal becomes its number, its alpha too);
both branches must set the same properties. `fontWeight` also takes a number (100 to 900; 0 and 1 are normal and bold, as before), the scroll indicator keys a
boolean (`showsVerticalScrollIndicator: !busy()`). A string decided elsewhere (a variable,
a call) is a build error. For other changes, select named
styles with `condition ? styles.a : styles.b` or `condition && styles.a`. `null`, `false`, `undefined` branches are
empty styles. Object spreads, nested style arrays, `calc`, grid, arbitrary CSS
selectors and the React Native transform-array syntax are not implemented. Unsupported keys/values are build errors.
Static font sizes (1–256 px) are passed to font baking; dynamic sizes use Zinc's existing nearest baked font behavior.
Fonts of the app: every `assets/<Family>.ttf` is `font-[Family]`, its weights `<Family>-Medium.ttf`, `-SemiBold`, `-Bold` (... `-Black`, `-Italic`);
`ui.setFontSans('Family')` makes it what `font-sans`, the default, means (Tailwind's `--font-sans`; `examples/nuxt-ui` uses Public Sans), Inter otherwise.

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

`ui.createSurface(w, h)` makes a node that shows a runtime image the program fills (a WebGL canvas, video frames). It is laid out and painted like an `<Image>`, so it scrolls and clips with its page; `ui.surfaceImage(node)` is the image handle to fill.

With `"webgl": true` in `zinc.json`, `zinc:script` contexts get `document.createElement('canvas').getContext('webgl' | 'webgl2')`, and `gl.zincPresent(image)` copies the drawing buffer into the surface (rows flipped, no alpha):

```ts
const vm = new Script({ engine: 'quickjs' });
vm.eval(source);                                   // creates a canvas and a draw(image) function
const view = ui.createSurface(256, 256);
vm.call('draw', [ui.surfaceImage(view)]);          // every frame, or when the scene changes
ui.repaint();                                      // the surface changed behind the UI's back: an idle page keeps its last frame otherwise
```

`tests/golden/webgl-surface` is the working example.

## Native views: a real OS view at a node's box

`<NativeView view={host} className="..." />` (from `zinc:ui`) is a leaf laid out like a `<View>` whose box a real native view takes: a web view
(`zinc:webview`'s `WebView` is a host), later a map or an ad. What Flutter calls platform views and React Native native components.

```tsx
import { NativeView } from 'zinc:ui';
const web = webview.create({ url: 'zinc://index.html', html: '', x: 0, y: 0, w: 1, h: 1 });
<ScrollView className="grow"><NativeView className="h-[420px] mx-3" view={web} /></ScrollView>
```

After each painted frame zinc:ui tells the host the node's box and its clip (the surface, then every scroll area and `overflow-hidden` ancestor
up to its layer), in logical pixels of the surface, and whether it shows: `host.place(x, y, w, h, cx, cy, cw, ch, shown)`, only when one of
them changed. A host is any object with that method (`ui.NativeViewHost`); `ui.nativeView(node, host)` attaches one to a node made otherwise.

The rule: **Zinc never draws over a native view.** The view is laid over the surface (an NSView subview on macOS, a UIView subview of SDL's
view on iOS, a child of SDL's layout above its SurfaceView on Android), inside a container that clips it to the clip. It does not show while
its node is off screen, hidden, transparent or clipped away, nor while a layer painted above it overlaps it: a menu, a popover, a toast, and
any dialog with a backdrop (the kits' overlays are layers; docs above). Touches inside the clip go to the view, not to zinc:ui's gestures.
Costs, accepted: no Zinc content, shadow, blur, rounded clip or transform over or on the view (a rectangle clip only); inside a moving scroll
area the native view follows the frame the UI just painted, so it can trail a fast fling by a frame on a slow device. What one update costs is
measured in docs/reports/zinc-next-native-view.md. `tests/t0/ui_native_view.sh` is the reference of what a host is told.

## Style reference

<!-- ui-docs:begin -->
### Style keys (generated)

Object-style keys of `lib/std/ui.ts` (`PROP` table); `tools/ui-docs` rewrites this block.

| Id | Style key | Aliases |
|---|---|---|
| -1 | `rowGap` |  |
| -1 | `columnGap` |  |
| -1 | `marginAuto` |  |
| -1 | `borderTopLeftRadius` |  |
| -1 | `borderTopRightRadius` |  |
| -1 | `borderBottomRightRadius` |  |
| -1 | `borderBottomLeftRadius` |  |
| -1 | `borderTopColor` |  |
| -1 | `borderRightColor` |  |
| -1 | `borderBottomColor` |  |
| -1 | `borderLeftColor` |  |
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
| 60 | `minWidth` |  |
| 61 | `maxWidth` |  |
| 62 | `minHeight` |  |
| 63 | `maxHeight` |  |
| 64 | `aspectRatio` |  |
| 65 | `shadowColor` |  |
| 66 | `shadowOffsetX` |  |
| 67 | `shadowOffsetY` |  |
| 68 | `shadowOpacity` |  |
| 69 | `shadowRadius` |  |
| 70 | `elevation` |  |
| 71 | `rotate` |  |
| 72 | `skewX` |  |
| 73 | `skewY` |  |
| 74 | `scaleX` |  |
| 75 | `scaleY` |  |
| 76 | `borderStyle` |  |
| 85 | `numberOfLines` |  |
| 89 | `boxSizing` |  |
| 110 | `shadowLevel` |  |
| 111 | `colorAlpha` |  |
| 112 | `borderAlpha` |  |
| 113 | `objectFit` |  |
| 114 | `tintColor` |  |
| 115 | `zIndex` |  |
| 116 | `fontStyle` |  |
| 117 | `textTransform` |  |
| 118 | `textDecorationLine` |  |
| 119 | `textDecorationStyle` |  |
| 120 | `textDecorationColor` |  |
| 121 | `textShadowColor` |  |
| 122 | `textShadowAlpha` |  |
| 123 | `textShadowOffsetX` |  |
| 124 | `textShadowOffsetY` |  |
| 125 | `pointerEvents` |  |
| 126 | `cursor` |  |
| 127 | `shadowAlpha` |  |
| 128 | `outlineWidth` |  |
| 129 | `outlineColor` |  |
| 130 | `outlineOffset` |  |
| 131 | `outlineStyle` |  |
| 132 | `placeholderTextColor` |  |
| 133 | `selectionColor` |  |
| 134 | `cursorColor` |  |
| 135 | `showsVerticalScrollIndicator` |  |
| 136 | `showsHorizontalScrollIndicator` |  |
| 137 | `transitionProperty` |  |
| 138 | `transitionDuration` |  |
| 139 | `transitionTimingFunction` |  |
| 140 | `transitionDelay` |  |

### Accepted class tokens (generated)

The tokens of `tests/golden/ui-tokens` that `isKnownClass` accepts (families such as `p-N`, `rounded-*` and the colour scale take more values than the samples):

`-bg-linear-45`, `-m-4`, `-ml-px`, `-mt-2`, `-mx-1`, `-translate-y-1`, `-word-1`, `-z-10`, `@container`, `absolute`, `align-baseline`, `align-sub`, `align-super`, `aspect-[4/3]`, `aspect-auto`, `aspect-square`, `aspect-video`, `basis-0`, `basis-1/2`, `basis-32`, `basis-auto`, `basis-full`, `bg-[conic-gradient(red,blue)]`, `bg-[repeating-linear-gradient(45deg,#000_0_10px,#fff_10px_20px)]`, `bg-[url(stripes.png)]`, `bg-auto`, `bg-center`, `bg-conic`, `bg-conic-180`, `bg-cover`, `bg-gradient-to-bl`, `bg-linear-45`, `bg-linear-[25deg,red_5%,blue]`, `bg-linear-to-r/oklch`, `bg-linear-to-tr`, `bg-no-repeat`, `bg-none`, `bg-position-[10px_20%]`, `bg-radial`, `bg-radial-[at_25%_25%]`, `bg-repeat-space`, `bg-size-[50%_auto]`, `bg-top-right`, `bg-white`, `border`, `border-b-white/50`, `border-dashed`, `border-dotted`, `border-solid`, `border-t-red-500`, `border-x-blue-600`, `bottom-0`, `break-all`, `break-normal`, `break-words`, `capitalize`, `content-between`, `content-evenly`, `delay-75`, `duration-300`, `ease-in`, `ease-in-out`, `ease-linear`, `ease-out`, `flex-auto`, `flex-col-reverse`, `flex-none`, `flex-row`, `flex-row-reverse`, `flex-wrap`, `font-[Inter,Roboto-Mono]`, `font-black`, `font-light`, `font-medium`, `font-thin`, `from-10%`, `from-transparent`, `gap-2`, `gap-[10px]`, `gap-x-4`, `gap-y-2`, `group`, `grow`, `grow-2`, `grow-[0.5]`, `h-1/3`, `h-8`, `h-[1.5rem]`, `h-[10vh]`, `h-[25%]`, `h-screen`, `hidden`, `inset-0`, `inset-4`, `inset-[8px]`, `inset-x-2`, `inset-y-1`, `invisible`, `italic`, `items-center`, `justify-between`, `left-3`, `line-clamp-3`, `line-clamp-none`, `line-through`, `lowercase`, `m-2`, `m-auto`, `max-h-[300px]`, `max-w-full`, `max-w-md`, `min-h-screen`, `min-w-0`, `ml-6`, `ml-auto`, `mr-auto`, `mt-1`, `mt-auto`, `mx-3`, `mx-auto`, `my-auto`, `no-underline`, `normal-case`, `not-italic`, `object-[25%_75%]`, `object-cover`, `object-left-bottom`, `object-scale-down`, `object-top-left`, `opacity-50`, `order-2`, `order-first`, `order-last`, `outline`, `outline-2`, `outline-none`, `outline-offset-1`, `outline-red-500`, `overline`, `p-4`, `pb-[env(keyboard-inset)]`, `peer`, `pointer-events-auto`, `pointer-events-none`, `pt-1`, `pt-[env(safe-area-inset-top)]`, `px-2`, `relative`, `right-1`, `ring`, `ring-0`, `ring-2`, `ring-4`, `ring-indigo-500`, `ring-offset-2`, `rounded-b-[6px]`, `rounded-br`, `rounded-l-full`, `rounded-lg`, `rounded-t-lg`, `rounded-tl-xl`, `scroll-p-4`, `scroll-pt-2`, `scroll-px-3`, `select-all`, `select-auto`, `select-none`, `select-text`, `self-auto`, `self-end`, `shrink`, `shrink-0`, `shrink-[0.5]`, `size-8`, `snap-align-none`, `snap-both`, `snap-center`, `snap-end`, `snap-mandatory`, `snap-none`, `snap-proximity`, `snap-start`, `snap-x`, `snap-y`, `sr-only`, `static`, `sticky`, `text-balance`, `text-clip`, `text-ellipsis`, `text-justify`, `text-lg`, `text-nowrap`, `text-shadow`, `text-shadow-lg`, `text-shadow-md`, `text-shadow-none`, `text-shadow-red-500`, `text-shadow-sm`, `text-wrap`, `tint-[#80c0ff]`, `tint-red-500`, `to-90%`, `top-2`, `transition`, `transition-all`, `transition-colors`, `transition-none`, `transition-opacity`, `transition-shadow`, `transition-transform`, `translate-x-2`, `translate-x-[3px]`, `truncate`, `underline`, `uppercase`, `via-red-500`, `visible`, `w-1/2`, `w-4`, `w-[100px]`, `w-[10vw]`, `w-[2rem]`, `w-[50%]`, `w-full`, `w-screen`, `whitespace-normal`, `whitespace-nowrap`, `whitespace-pre`, `whitespace-pre-wrap`, `word-4`, `word-[3px]`, `z-10`, `z-[5]`, `z-auto`
<!-- ui-docs:end -->
