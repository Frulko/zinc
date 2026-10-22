# zinc:stage reference

`zinc:stage` builds a program as a scene of objects, as ActionScript 3 (Flash) and Haxe/OpenFL do: a `Stage` holds nodes, each node
has a position in its parent, children, and methods Zinc calls when it joins the scene, on every frame and when it draws. The nodes
draw with [`zinc:gfx`](gfx.md) in their own coordinates, and a light row/column layout can place them. Nothing is drawn while nothing
changed, so a frame costs only what it draws: it is the model of the demos for old devices (`examples/music-tree`, the HP TouchPad,
the Nexus 7; [`examples/GUIDELINES.md`](../../examples/GUIDELINES.md)). The source is [`lib/std/stage.ts`](../../lib/std/stage.ts).
New to it? [The scene lessons](../learn/13-a-stage-and-a-sprite.md) teach it in four steps, and `zinc new stage` starts a project.

```ts
import { onFrame, rrect } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, uiState } from 'zinc:stage';

class Ball extends Sprite {
  color: u32 = 0xf27aa6;
  speed: number = 120;
  override onUpdate(dt: number): void {
    this.x += this.speed * dt;
    if (this.x < 0 || this.x > 400) this.speed = -this.speed;
    uiState.dirty = true;                                         // it moved: draw the next frame
  }
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, this.color, 255);                    // (0, 0) is the ball's own corner
    registerTapZone('ball', 0, 0, w, h, () => { this.color = 0x5ec2f2; });
  }
}

const stage = new Stage();
stage.color = 0x1c1b20;
const ball = new Ball('ball');
ball.y = 100;
ball.width = 60;
ball.height = 60;
stage.addChild(ball);
onFrame((dt: number) => stage.frame(dt));                         // input, onUpdate, layout and drawing
```

## How a frame goes

`stage.frame(dt)`, called from `onFrame`:

1. The pointer goes to the zones the last drawn frame registered (`routePointer`): a press and release on a tap zone taps it, a
   drag zone gets its moves, a finger moved more than 12 pixels over a scroll box scrolls it. The wheel scrolls the box under the pointer.
2. `onUpdate(dt)` runs on every visible node, parents first; the scroll boxes move on with their fling.
3. When `uiState.dirty` or `uiState.animating` is set, the zones are forgotten, the window is cleared to `stage.color`, every node is
   laid out (`onMeasure`, then its row or column), then drawn (`onDraw`, parents under children, registering the new zones). Else the
   previous picture stays on screen (`keep()`).

Set `uiState.dirty = true` when something shown changed (an event, an answer, a timer). The layout and the drawing never set it. A
tap, a drag and a scroll set it themselves.

## DisplayObject

The node. `Sprite` is the same class under the name AS3 and OpenFL use; extend either.

| Field | What it holds |
|---|---|
| `name: string` | A readable name, for debugging (`new Sprite('ball')`). |
| `x`, `y: number` | Position in the parent, in pixels. A row or a column sets them for its children. |
| `width`, `height: number` | Size in pixels; 0 takes the size the parent gives. |
| `visible: boolean` | False: no layout, no `onUpdate`, no `onDraw`, for the node and its children. |
| `parent: DisplayObject \| null` | The node that holds it. |
| `children: DisplayObject[]` | Its children, the first drawn first (under the others). Change it through the methods below. |
| `isOnStage: boolean` | True while it is in a tree whose root is a `Stage`. |
| `direction: string` | `'none'` (children placed by their `x` and `y`), `'row'` (left to right) or `'column'` (top to bottom). |
| `gap: number` | Pixels between two visible children of a row or a column. |
| `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft: number` | Inner margins of a row or a column. |
| `flex: number` | In a row or a column, the share of the free space it takes; 0 keeps its own size. |
| `alignItems: string` | The children on the other axis: `'start'`, `'center'`, `'end'`, or `'stretch'` (they take the whole width or height). |
| `autoHeight: boolean` | A row or a column computes its height from its children. |

| Method | What it does |
|---|---|
| `addChild(child)` | Adds `child` on top of the others, taking it from its former parent; returns it. |
| `addChildAt(child, index)` | Adds `child` at `index` (0: under all the others). |
| `removeChild(child)` | Takes `child` out; returns it. |
| `removeChildAt(index)` | Takes out the child at `index`; returns it. |
| `removeChildren()` | Takes out every child. |
| `numChildren: i32` | The number of children (read only). |
| `getChildAt(index)` | The child at `index`. |
| `getChildIndex(child)` | The index of `child`, -1 when it is not one. |
| `contains(node)` | True when `node` is this node or lies anywhere under it. |
| `stage: Stage \| null` | The `Stage` at the root of its tree, null when it is not under one (read only). |
| `mouseX`, `mouseY: number` | The pointer in this node's coordinates (read only). |
| `setPaddingSymmetric(horizontal, vertical)` | Sets the four paddings; returns the node. |

The hooks a subclass overrides (they do nothing by default):

| Hook | When Zinc calls it |
|---|---|
| `onAddedToStage()` | It joined a tree under the `Stage` (its children are told after it): start what it needs (data, timers). |
| `onRemovedFromStage()` | It left the `Stage`'s tree (its children are told before it): stop what it started. |
| `onUpdate(dt)` | Every frame while it is visible, parents first; `dt` is in seconds. |
| `onMeasure()` | Before it is laid out: set its size and values (text, visibility) in place; never add or remove children there. |
| `onDraw(localWidth, localHeight)` | When the frame is drawn: draw with `zinc:gfx`, (0, 0) at its corner, and register its zones. |

The passes, for a node that changes how its children are laid out or drawn (a scroll container, a carousel):

| Method | What it does |
|---|---|
| `computeLayout(availableWidth, availableHeight)` | Calls `onMeasure`, then places the children (row, column, or each in the given size). |
| `renderTree(parentWidth, parentHeight, parentWorldX, parentWorldY)` | Moves the drawing to its screen position, calls `onDraw`, then draws its visible children. |
| `layoutAndRender(width, height, worldX, worldY)` | One whole pass with this node as the root: a page drawn offscreen into an image. |
| `updateTree(dt)` | Calls `onUpdate` on it and its visible children. |
| `notifyAddedToStage()`, `notifyRemovedFromStage()` | Tell it and its children (`addChild` and `removeChild` call them). |

## Stage

The root of the scene, a `DisplayObject` that is always on stage.

| Member | What it does |
|---|---|
| `color: u32` | The colour `frame` clears the window to (0x000000 by default). |
| `frame(dt)` | One whole frame (above); call it from `onFrame`. |
| `renderStage(width, height)` | Lays out and draws the scene now, at that size: for a program that drives its own frame (music-tree). |

## The frame state: `uiState`

| Field | What it holds |
|---|---|
| `dirty: boolean` | Set it when something shown changed: the next frame draws. |
| `animating: boolean` | Set it in `onDraw` (a spinner, a fade) to have the next frame drawn too. |
| `pointerX`, `pointerY: number` | The pointer of this frame, in window pixels. |
| `pressedZoneId: string` | The id of the zone held under the finger, `''` when none. |
| `offsetX`, `offsetY: number` | The window position of the node being drawn; the zones it registers are moved by it. |

## Zones

A node registers its zones in `onDraw`, in its own coordinates. The zones of the last drawn frame take the input until the next drawing.

| Function | What it does |
|---|---|
| `registerTapZone(id, x, y, w, h, onTap)` | A rectangle that calls `onTap()` on a press and release with no movement. |
| `registerDragZone(id, x, y, w, h, onDrag)` | A rectangle that calls `onDrag(localX, localY, phase)` in the node's coordinates; `phase`: 0 press, 1 move, 2 release, 3 cancelled. |
| `isZonePressed(id)` | True while that zone is held: draw it pressed. |
| `beginScrollBox(box, x, y, w, h)` | Opens a scroll box: what is drawn until `endScrollBox` is clipped to it, and so are the zones (a row under a header takes no tap). Move the content by `-box.scrollY`. |
| `endScrollBox()` | Closes it. One level: a scroll box inside another is not supported. |
| `isLocalRectVisible(x, y, w, h)` | False when the rectangle lies wholly outside the open scroll box: skip drawing it. |
| `findTopmostZoneAt(x, y, forTapsAndDrags)` | The hit test: the topmost zone under a window point, the last drawn first; true looks for tap and drag zones, false for scroll boxes. |
| `routePointer(x, y, isDown, dt)` | One frame of the pointer routed to the zones (what `frame` calls with `zinc:gfx`'s pointer); call it yourself for a pointer of your own. |
| `scrollBoxUnderPointerByWheel(x, y, deltaY)` | Scrolls the box under the point by `deltaY` pixels (+ = up); false when there is none. |
| `clearTouchZones()` | Forgets the zones (before a drawing). |
| `takeTouchZones()`, `restoreTouchZones(zones)` | Set the zones of the screen aside while a drawing whose zones must not count runs (a page warmed up offscreen). |

`ScrollBox`: `scrollY` (how far it is scrolled), `contentHeight` (set it from the layout), `viewportHeight` (set by `beginScrollBox`),
`velocityY` (the fling, pixels per second), `maxScrollY()`, `clamp()`, `stepInertia(dt)` (moves the fling on; `frame` calls it for
the boxes on screen).

`TouchZone` (what the hit test returns): `id`, `x`, `y`, `width`, `height` (in the window), `onTapCallback`, `onDragCallback`,
`originX`, `originY` (the window position of the node that registered it), `scrollBox`, `containsPoint(x, y)`, `drag(x, y, phase)`
(calls the drag callback with a window point, brought to the node's coordinates), `copyFrom(zone)`. The zones are reused from frame
to frame: a router of your own that keeps the pressed zone across frames copies it (`pressed.copyFrom(zone)`).

A program with gestures of its own (music-tree swipes its carousel between pages) writes its own router from `findTopmostZoneAt`
and draws with `renderStage`: [`examples/music-tree/src/main.ts`](../../examples/music-tree/src/main.ts).

## What AS3 has that zinc:stage has not

- No events: no `addEventListener`, `MouseEvent`, `Event.ENTER_FRAME`, bubbling or capture. A node overrides its hooks (`onUpdate`
  is ENTER_FRAME, `onAddedToStage` is ADDED_TO_STAGE) and registers zones for the pointer.
- No transforms on a node: `scaleX`, `scaleY`, `rotation`, `alpha`, `filters`, `blendMode`, `mask`, `cacheAsBitmap`. A node draws
  scaled or faded with `zinc:gfx` itself (`setTransform`, an alpha argument, `beginImage` for a cached picture).
- No `graphics` object: a node draws in `onDraw`, every time the frame is drawn.
- No `localToGlobal`, `globalToLocal`, `getBounds`, `hitTestPoint`, `hitTestObject`, `setChildIndex`, `swapChildren`,
  `getChildByName`, `mouseEnabled`, `mouseChildren`, `buttonMode`; `mouseX` and `mouseY` give the pointer in a node's coordinates.
- No `TextField`, `Bitmap`, `Loader` or `Sound` nodes: text, images and sound come from `zinc:gfx` and `zinc:audio`.
- The pointer is one finger: no multitouch gestures (`TouchEvent`, `GestureEvent`); the keyboard is read with `zinc:gfx`.
