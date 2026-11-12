# Game scenes, sprites, tilemaps, cameras and input

`zinc:game` is a caller-owned layer over `zinc:sprite`, `zinc:tilemap` and `zinc:gfx`. It registers no frame
callback and loads no atlas at import. The same typed source runs interpreted,
with QuickJS, or compiled AOT.

```ts
import { onFrame } from 'zinc:gfx';
import { atlas } from 'zinc:sprite';
import { Scene, SceneController, Sprite, Playback } from 'zinc:game';

class Level extends Scene {
  hero: Sprite;
  constructor() {
    super();
    const walk = atlas('game').animation('hero_run');
    this.hero = new Sprite(walk.frameAt(0));
    this.hero.playback = new Playback(walk);
    this.hero.x = 20;
  }
  override update(seconds: number): void { this.hero.update(seconds); }
  override draw(): void { this.hero.draw(); }
}
const level = new SceneController(new Level());
level.start();
onFrame((seconds: number) => { level.update(seconds); level.draw(); });
```

A `Scene` has `enter`, `update(seconds)`, `draw` and `leave` hooks. A
`SceneController` starts Idle. `start()` calls enter, `update()` and `draw()`
require Active, and `stop()` calls leave. Stop then start restarts the same
scene; the hooks own their resources and reset their game state. Recursive
controller operations from a hook throw. Failed enter or leave returns to
Idle; failed update or draw returns to Active. Errors propagate to the caller.
The readonly `state` reports a `SceneState`.

A `Playback` takes an existing `Animation` and an optional `loop` (default
true). `update(seconds)` advances its clock; `milliseconds` reports it.
`pause()` requires Playing, `resume()` requires Paused, and `restart()` resets
to Playing at zero from any state. Nonlooping playback reaches Finished and
holds the final frame. Calling update while Paused or Finished does nothing.
Negative or nonfinite time throws. `frame()` uses the animation's existing
forward, reverse or pingpong order. Animations require nonempty frames with
finite positive durations in milliseconds. Atlas reloads keep their frame and
animation references; playback reads the current durations without a cache.

A `Sprite` has a `frame`, optional `playback`, `x`, `y`, `width`, `height`,
`alpha`, `flags`, `rotation`, `tint`, and `blend`. `update(seconds)` updates
its playback and frame. `draw()` delegates to `Frame.draw`, preserving atlas
trim, pivot, mirroring, tint and batching. Width or height zero uses the frame's
own size; position is the untrimmed image's top-left, rotation is radians,
alpha is 0–255, and tint is `0xRRGGBB`.

See `examples/platformer`: its frame loop drives a scene, the flag uses
Playback, and the hero uses Sprite. No sprite-count or frame-rate guarantee
has been measured for this layer.

`loadTileMap(name)` loads an imported Tiled `.tmj` or LDtk `.ldtk` asset:

```ts
import { loadTileMap } from 'zinc:game';
const map = loadTileMap('levels/world.ldtk');
const room = map.level('Level_1');
// In the frame callback: world point (camX, camY) is the screen's top left.
room.draw(0, 0);
```

Give the project an asset rule `{ "match": "levels/**/*.{tmj,ldtk}", "as": "tilemap" }`.
The module also exports `TileMap`, `Level`, `Layer`, `MapObject` and `Properties`
from `zinc:tilemap`. It uses that module's loader and culled drawing directly;
see [Tilemaps](../plugins/tilemap.md) for layers, objects, properties, parallax,
asset ownership and format limits. Loading a missing or unimported map throws.

## Camera and actions

`Camera(width, height)` takes a positive viewport size in world units.
`viewport(width, height)` updates it, `bounds(worldWidth, worldHeight)` enables
nonnegative bounds starting at the world origin, and `move(x, y)` sets the
world top-left. `follow(x, y)` centers a world point. Bounds clamp each axis;
a world smaller than the viewport is centered on that axis. Read `x`/`y` for
the base position, `viewX`/`viewY` for drawing tilemaps and sprites.

`shake(seconds, amplitude)` replaces the current shake with random offsets
bounded by the amplitude in world units. Call `update(seconds)` each frame;
expiry, zero duration/amplitude, and `reset()` clear offsets immediately.
`shakeState` is Idle or Shaking. Shake does not change the bounded base position
and can reveal the area outside the world. Coordinates, sizes, amplitudes and
time must be finite; negative sizes, amplitude or time throw.

```ts
import { Camera, InputActions } from 'zinc:game';
import { GamepadAxis, GamepadButton } from 'zinc:gfx';
const camera = new Camera(480, 272);
camera.bounds(2000, 800);
const actions = new InputActions();
const right = actions.add().key('d').key('ArrowRight')
  .axis(0, GamepadAxis.LeftX, 1, 0.25);
const jump = actions.add().key(' ').pointer().button(0, GamepadButton.South);
// Once per frame, before game logic:
actions.update();
if (right.down) camera.move(camera.x + right.value * 3, camera.y);
// Queries are nonconsuming; jump.pressed may be read by several callers.
camera.update(1 / 60);
// level.draw(camera.viewX, camera.viewY, 480, 272);
```

Each `add()` returns an action. Bindings combine by maximum strength, so
releasing one binding while another is held does not release the action.
`value` is 0..1, `down` means positive strength, and `pressed`/`released` are
edges since the latest update. Both edges remain true for a key tapped within
one frame. Duplicate key-down and Repeat/Text events do not create edges.
Keys use `zinc:gfx` key names (Space is `' '`). Pointer buttons are zero-based
(0 left, 1 middle, 2 right). Gamepad button values retain analog strength;
axis direction is -1 or 1, and deadzone is in [0, 1), rescaled to 0..1.
Disconnected pads contribute zero.

Call `update()` exactly once per caller frame. Actions register no listeners
and consume no shared signal queue. Call `reset()` on restart and when your
application handles focus loss: it clears held keys, strengths and edges.
Pointer/gamepad state is sampled again on the next update. InputActions does
not replay input received before its creation. The platformer combines actions
with the existing `Btn` mapping for console HAL controls.

## Signatures and defaults

All objects below belong to the caller. Keep one controller per scene and call
its methods from your frame loop. There is no global active scene, automatic
scene switching, physics clock or audio mixer in this module.

| API | Contract |
|---|---|
| `new Scene()` | Empty `enter(): void`, `update(seconds: number): void`, `draw(): void`, `leave(): void` hooks to override. |
| `new SceneController(scene: Scene)` | Retains the scene, initially `SceneState.Idle`. `start()`, `update(seconds)`, `draw()`, `stop()` return void; readonly `state` reports Idle, Entering, Active, Updating, Drawing or Leaving. |
| `new Playback(animation: Animation, loop: boolean = true)` | Retains the animation. Public `animation` and `loop` can be changed; readonly `state: PlaybackState` is Playing, Paused or Finished, initially Playing. `milliseconds: number` starts at zero. |
| `playback.update(seconds: number)`, `pause()`, `resume()`, `restart()` | Return void. Time is seconds here, milliseconds in `Animation`; accumulated time overflow throws. `frame(): Frame` returns the current atlas frame. |
| `new Sprite(frame: Frame)` | Retains the frame. `playback: Playback \| null = null`; `x`, `y`, `width`, `height`, `rotation`, `flags`, `blend` default to zero; `alpha = 255`, `tint = 0xffffff`. `update(seconds)` and `draw()` return void. |
| `new Camera(width: number, height: number)` | Initially at (0, 0), unbounded, with no shake. `viewport(width, height)`, `bounds(width, height)`, `move(x, y)`, `follow(x, y)`, `shake(seconds, amplitude)`, `update(seconds)`, `reset()` return void. Position getters return numbers; `shakeState` is `ShakeState.Idle` or Shaking. |
| `new InputActions()` | Initially no held keys or actions. `add(): InputAction`, `update(): void`, `reset(): void`. Each collection owns its key history and actions. |
| `action.key(name: string)` | Adds an exact, nonempty key name. All binding methods return this same `InputAction` for chaining. |
| `action.pointer(button: i32 = 0)` | Adds a pointer button, range 0..4. |
| `action.button(pad: i32, button: GamepadButton)` | Adds a nonnegative pad index and a button from `zinc:gfx` (0..16). |
| `action.axis(pad: i32, axis: GamepadAxis, direction: number, deadzone: number = 0.2)` | Axis 0..3, direction exactly -1 or 1, finite deadzone from 0 inclusive to 1 exclusive. |
| `action.value`, `down`, `pressed`, `released` | Readonly number/booleans. `reset(): void` clears strength and edges; `clearEdges(): void` clears only edges. `sample(keys: string[]): void` is the low-level sampler used by the collection; normally call `InputActions.update()` instead. |
| `loadTileMap(name: string): TileMap` | Alias of `zinc:tilemap.load`; see the [tilemap API](../plugins/tilemap.md). |

`SceneController.update` rejects negative/nonfinite time before invoking the
hook. Calling start twice, stop before start, or driving a controller inside
its own hook throws. Switch controllers after the current hook has returned.
For a new round, stop the old controller, then start the next; reset game
state in `enter()`. See the [game guide](../guide/15-games.md) and the
[template](../../templates/game-2d/src/main.ts).

`Camera.reset()` cancels shake only: it preserves the base position, viewport
and bounds. `InputActions.reset()` preserves bindings. Reset a collection on
focus loss in the application that owns the `zinc:gfx` signal queue; do not
have multiple subsystems drain that queue. Reset on restart when held keys
should be forgotten. Pointer and gamepad values return on the next sample
if the device is still held.

Sprites and playback do not load, clone or unload atlas resources. A Sprite
with no playback needs no update call. Sharing a Playback shares its clock;
advance it once per frame. See [sprites](../plugins/sprite.md) for atlas assets,
frames, animation names and reload ownership.

Use [audio](../plugins/audio.md) and [physics2d](../plugins/physics2d.md)
directly. `zinc:game` does not re-export either plugin or add a performance
guarantee. A scene that opens a physics world or a music stream releases it
in `leave()`; failed setup must clean up what it opened before propagating
the error. `Sound.unload()` stops its voices and releases decoded samples;
`World.destroy()` releases bodies and joints.
