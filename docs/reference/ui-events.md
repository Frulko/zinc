# zinc:ui events reference

An event is something that happens to the interface: a press, a move, a key, an edit. In JSX you give an element a
function in an attribute whose name starts with `on`; Zinc calls it when the event happens on that element. A few events
concern the whole window and are functions of the `zinc:ui` module instead. New to them? [Lesson 9](../learn/09-events.md)
is a gentle start.

```tsx
import * as ui from 'zinc:ui';   // the types ui.PointerEvent, ui.KeyEvent and the window-wide functions

<Button onClick={() => save()}><Text>Save</Text></Button>
<View onPointerDown={(e: ui.PointerEvent) => console.log(`pressed at ${e.x}, ${e.y}`)} />
<Input value={name()} onInput={(v: string) => setName(v)} />
```

The attributes work the same with `zinc:ui/solid` and `zinc:ui/react` (one difference: `onChange`, below). Only the
elements that have a handler (or are buttons and fields) take presses: a plain `View` lets them through to what is under
it. A press goes to the topmost such element under the pointer, then up through the elements that hold it, to the
nearest one that has a handler for that event. Elements inside a `disabled` one get no events.

## Clicks and the pointer

The pointer is the mouse, the trackpad, a pen or the first finger on a touch screen. Every one of these attributes works
on any element.

| Attribute | The function gets | It runs when |
|---|---|---|
| `onClick` (or `onPress`) | nothing: `() => void` | the element was pressed and released over it, and the press was not a drag or a scroll; or Enter or Space (a gamepad's A or Start) while it has the keyboard focus. The element becomes focusable and dims while pressed. |
| `onPointerDown` | `ui.PointerEvent` | a button or a finger goes down on the element. The element then **captures** the pointer: it gets every move and the release, even outside its box, until the release. |
| `onPointerMove` | `ui.PointerEvent` | the pointer moves over the element; while the element captures the pointer, every move anywhere. `e.button` is -1. |
| `onPointerUp` | `ui.PointerEvent` | the button or the finger comes up, after a press on the element. |
| `onPointerCancel` | `ui.PointerEvent` | a gesture (a drag, a scroll, a pinch) took the press away from the element: no `onPointerUp` and no click follow. |
| `onDoubleClick` | `ui.PointerEvent` | a second click within 400 ms and 6 pixels of the first. `e.clicks` is 2. |
| `onContextMenu` | `ui.PointerEvent` | a right click (the menu button). |
| `onWheel` | `ui.PointerEvent` | the mouse wheel turns, or two fingers move on a trackpad, over the element: `e.wheel` (steps, more than 0 up), `e.wheelX` (more than 0 right), `e.pinch` (a trackpad pinch factor). |
| `onPointerEnter` | `ui.PointerEvent` | the pointer comes over the element or one inside it. |
| `onPointerLeave` | `ui.PointerEvent` | the pointer leaves it. |

For hover colours without code, use the `hover:` classes (`hover:bg-slate-100`); for the cursor, `cursor-pointer` and
the other `cursor-*` classes.

## Gestures

Gestures share the press with scrolling: the first one that recognises its movement takes the pointer, and the others
get `onPointerCancel`. So a swipe row inside a scrolling list keeps sideways moves and lets vertical ones scroll.

| Attribute | The function gets | It runs when |
|---|---|---|
| `onTap` | `ui.PointerEvent` | on release, when no gesture took the press, no long press fired and the pointer is still over the element. |
| `onLongPress` | `ui.PointerEvent` | the press was held 500 ms without moving into a gesture. No click and no tap follow. |
| `onDrag` | `ui.PointerEvent` | the pointer moved past the threshold: `e.phase` 0 when the drag starts, 1 on each move, 2 on release, 3 when a pinch takes over. `e.dx`, `e.dy`: the distance since the press. |
| `onPinch` | `ui.PointerEvent` | a second finger lands on the element: `e.phase` 0, 1, 2 as the fingers land, move and lift; `e.scale` and `e.rotation` (radians) since the start; `e.x`, `e.y` the point between the fingers. |
| `{...pan.panHandlers}` | `(e: ui.ResponderEvent, g: ui.GestureState)` | React Native's `PanResponder` (`ui.PanResponder.create({...})`), built on `onDrag`: grant, move, release, terminate. See [zinc:ui in depth](../ui.md#gestures-panresponder-and-animatedevent). |

Attributes that tune them: `dragAxis="x"` (or `"y"`, `"both"`: the default), `dragThreshold={4}` (pixels, default 8),
`grab="keep"` (nothing takes the pointer from this element's own `onPointerDown`: a drawing surface) or `grab="keep-x"`
(keeps mostly sideways moves only: a slider in a list).

## The keyboard

| Attribute or function | The function gets | It runs when |
|---|---|---|
| `onKeyDown` | `ui.KeyEvent` | a key goes down while the element, or one inside it, has the keyboard focus. A `View` takes the focus when it has `focusable` and is clicked or reached with Tab; a `Button` and a text field are focusable already. |
| `ui.onKey(f)` | `ui.KeyEvent` | a key goes down and nothing before used it: for the shortcuts of the whole window. |
| `ui.onAction(h, action, f)` | nothing | a keystroke bound with `ui.bindKeys('mod-s', 'save')` is pressed with the focus in element `h` (`-1`: anywhere). With `keyContext="Editor"` on an element, `ui.bindKeys('mod-k', 'palette', 'Editor')` binds only inside it. |

Order for each key: the focused element's `onKeyDown` (or the nearest one above it), then a text field's own editing,
then the `ui.onKey` functions, each only if nothing before called `e.preventDefault()`. A key nobody used then does the
usual thing: the arrows, Tab and Shift+Tab move the focus, Enter and Space press the focused element, Escape takes the
focus away (with nothing focused: leaves full screen, else closes the window).

## Text fields

| Attribute | The function gets | It runs when | Elements |
|---|---|---|---|
| `onInput` | the text, `(v: string) => void` | after every edit (a key typed, a paste, a cut, an undo). | `Input`, `TextArea` |
| `onChange` | the text, `(v: string) => void` | with `zinc:ui/solid`: when the field loses the focus or Enter is pressed (one-line field), after the text changed. With `zinc:ui/react`: after every edit, as in React. | `Input`, `TextArea` |
| `onSubmit` | nothing | Enter is pressed in a one-line field inside the element (on the web: its form is sent). | any element that holds a field |

Pair `onInput` with `value` to keep the field and a signal in step:
`<Input value={name()} onInput={(v: string) => setName(v)} />`.

## Scrolling, drawing, frames

| Attribute or function | The function gets | It runs when | Elements |
|---|---|---|---|
| `onScroll` | `(e: ui.ResponderEvent, g: ui.GestureState)` | once per frame in which the content moved: `e.nativeEvent.contentOffset.x`, `.y` is how far it is scrolled. | `ScrollView` (and views with `overflow-y-auto`, `overflow-x-auto`) |
| `onDraw` | `(x: i32, y: i32, w: i32, h: i32)`: the element's box, in window pixels | the element is painted: a `Canvas` on every frame (with `style={{ lazy: 1 }}`, only when something else changed or after `ui.repaint()`). Draw with the `zinc:gfx` functions inside that box. | `Canvas` |
| `render(App, background, onTick)` | `onTick(dt: number)`: seconds since the last frame | on every frame, before the interface is drawn: the place for games and animations driven by code. | (the third argument of `render`) |

## Window-wide functions

| Function | The function gets | It runs when |
|---|---|---|
| `ui.onKey(f)` | `ui.KeyEvent` | a key nothing else used (above). |
| `ui.onFocusChange(f)` | the focused element's number, `-1` for none | the keyboard focus moves (a phone shows or hides its keyboard on it). |
| `ui.onDismiss(h, f)` | nothing | Escape is pressed while element `h` is on screen, and it is the most recently shown element with such a function: close a dialog, a menu. |
| `ui.onOutsidePointer(h, f, except?)` | `ui.PointerEvent` | a press lands outside element `h` (and outside `except`, the button that opens it) while `h` is on screen. |

`h` is an element's number: get it with `ref`. `const box = createNodeRef();` (from `zinc:ui/solid`), `<View ref={box}>`,
then `box.node`.

## What the function gets

**`ui.PointerEvent`**

| Field | Meaning |
|---|---|
| `x`, `y` | where, from the top left corner of the element that handles the event (inside a scaled view, in its own units) |
| `gx`, `gy` | where, from the top left corner of the window |
| `button` | 0 left, 1 middle, 2 right; -1 for a move |
| `shift`, `ctrl`, `alt`, `meta` | whether that key was held (`meta` is Cmd on a Mac); `mods` has them all as bits (`ui.SHIFT`, `ui.CTRL`, `ui.ALT`, `ui.META`) |
| `clicks` | 2 on a double click |
| `wheel`, `wheelX`, `pinch` | `onWheel`: wheel steps (more than 0: up, right) and the trackpad pinch factor |
| `phase` | gestures: 0 start, 1 move, 2 end, 3 cancelled |
| `dx`, `dy` | gestures: the distance since the press, in window pixels |
| `scale`, `rotation` | `onPinch`: since the pinch started (rotation in radians) |

**`ui.KeyEvent`**

| Field or method | Meaning |
|---|---|
| `key` | the key, as the web names it but without Shift: `'a'`, `'1'`, `' '`, `'Enter'`, `'Tab'`, `'Escape'`, `'Backspace'`, `'Delete'`, `'ArrowLeft'`..., `'Home'`, `'End'`, `'PageUp'`, `'PageDown'`, `'F1'`...`'F12'` |
| `shift`, `ctrl`, `alt`, `meta` | whether that key was held; `mods` has them as bits |
| `primary` | Cmd on a Mac, Ctrl elsewhere: test this for shortcuts that work everywhere (`e.primary && e.key === 's'`) |
| `repeat` | `true` when the key is held and repeating |
| `preventDefault()` | "this key is used": nothing after this function handles it (no typing, no focus move, no other handler) |

## Under the attributes

Each attribute is turned into a call of the `zinc:ui` module on the element's number, which a program can also make
itself: `onClick` is `ui.listen(h, f)`; the pointer attributes are `ui.onPointer(h, kind, f)` with `kind` one of
`ui.PDOWN`, `PMOVE`, `PUP`, `PDBL`, `PCONTEXT`, `PWHEEL`, `PENTER`, `PLEAVE`, `PTAP`, `PLONG`, `PDRAG`, `PPINCH`,
`PCANCEL`; `onKeyDown` is `ui.onKeyDown(h, f)`; `onInput` and `onChange` are `ui.onText(h, change, f)`; `onSubmit` is
`ui.onSubmit(h, f)`; `onScroll` is `ui.onScroll(h, f)`; `onDraw` is `ui.draw(h, f)`. Sources: `lib/std/ui.ts` and the
JSX lowering in `src/frontend/jsx.cpp`. More on each: [zinc:ui in depth](../ui.md).
