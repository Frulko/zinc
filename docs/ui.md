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
| `highlight` | `(line: string) => i32[]`: colour runs `[length, color, length, color...]` for one visual line (`-1`: text colour). `ui.tsHighlight` colours TypeScript / Zinc keywords, types, strings, numbers and `//` comments |

Default size: 200 px wide (stretch, `grow`, `w-*` size it), one line (or `rows` lines) high; styled by classes like any
node (`bg-*`, `text-*`, `border-*`, `rounded-*`, `p-*`, `font-mono`, `text-sm`...). The focused field gets a blue
border, or `focus:border-<color>`.

Editing: click places the caret (Shift+click extends), double click selects a word, triple click a line, drag
selects (the text scrolls past the edges); arrows, Alt/Ctrl+arrows by word, Cmd+arrows / Home / End by line,
Cmd+Up/Down or Ctrl+Home/End to the start / end, PageUp/PageDown, Shift extends; Backspace / Delete (by word with
Alt/Ctrl, to the line start with Cmd); Cmd/Ctrl+A, C, X, V, Z, Shift+Z / Y; Tab / Shift+Tab move the focus (Tab into
a single-line field selects it); Escape blurs. Undo coalesces consecutive typing into one step (100 steps).
The caret blinks without repainting in between; horizontal scroll follows the caret in inputs, vertical scroll and
the wheel in textareas.

Host ABI: `ui.createNode(ui.INPUT | ui.TEXTAREA)`, `setValue`, `getValue`, `setPlaceholder`, `onText(h, change, f)`,
`setHighlight`, `select(h, a, b)`, `caretOf`, `selectedText`, `focusNode(h)`, `focused()`; flags through
`setNumber(h, 'password' | 'readOnly' | 'lineNumbers' | 'wrap' | 'rows', v)`.

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
  `onPointerDown` stops at a button or a text field on the way up, so pressing a button inside a draggable card does
  not drag it.
- Capture: the node whose `onPointerDown` ran gets every `onPointerMove` and the `onPointerUp` until the button is
  released, even outside its box (drags). Without capture, moves go to the node under the pointer.
- `onClick` / `onPress` keep their meaning: activated on release over the same node, not after a drag-scroll, and
  from the keyboard / gamepad (focus + A / Start / Enter / Space). A node with `onPointerDown` does not start
  drag-to-scroll in its scroll container.
- Enter / leave follow the hover path (the node under the pointer and its ancestors), like DOM `pointerenter`.
- Mouse button events come in order from the HAL, so a quick trackpad tap is not lost between frames.

## Hover and cursors

`hover:bg-*`, `hover:text-*`, `hover:border-*` apply while the pointer is over the node or a descendant (other
`hover:` tokens are accepted and ignored). `focus:border-*` joins `focus:bg-*` / `focus:text-*`.

`cursor-default`, `cursor-pointer`, `cursor-text`, `cursor-move`, `cursor-grab`, `cursor-grabbing`,
`cursor-ew-resize` / `cursor-col-resize`, `cursor-ns-resize` / `cursor-row-resize`, `cursor-crosshair`,
`cursor-not-allowed`: the nearest one from the hovered node up (text fields show the I-beam); `cursor-grab` shows
grabbing while its node has the pointer captured. SDL has no hand cursors: grab / grabbing show the move cursor.

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
field has the focus the gamepad-style navigation (arrows, WASD, Space...) is off. Escape is an ordinary key for
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

## Tests

Test hooks drive the input headlessly; from the first call on, the HAL's pointer and keyboard are ignored, so a
program prints the same on the sim and on native targets (`tests/conformance/input.tsx`, `input_react.tsx`):
`ui.pointerAt(x, y, down, button = 0, mods = 0)`, `ui.wheelAt(x, y, dy, dx = 0, pinch = 1)`,
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

Not done yet: IME composition preview (committed text works), block comments in `tsHighlight`, word-wise drag
selection after a double click, exact-size fonts for continuous zoom.
