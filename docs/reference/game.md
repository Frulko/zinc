# Game scenes, sprites, tilemaps, cameras and input

`zinc:game` is a caller-owned layer over `zinc:sprite`. It registers no frame
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
