# Game scenes, sprites and animation

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
