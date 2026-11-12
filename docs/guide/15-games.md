# 15. Build a 2D game

Start with a playable game, then change its rules. This chapter is for someone
who knows basic TypeScript and wants scenes, sprites and controls without a
JavaScript game engine. `zinc:game` supplies typed, caller-owned objects; your
program decides when they update and draw. The same source can run in the
interpreter, compile AOT or run on QuickJS.

## Start with Coin Rush

```sh
zinc new game-2d coin-rush
cd coin-rush
zinc run --interp
zinc run --native
zinc test
```

Press Enter, Space or click to start. Move with arrows, WASD, a gamepad, or
hold the pointer where you want to go. Collect five respawning coins during a
30-second round; the best score survives the next run.

The generated project separates responsibilities:

| File | Change here to… |
|---|---|
| `src/main.ts` | change when scenes start and stop |
| `src/scenes.ts` | change title, play and game-over drawing or round behavior |
| `src/input.ts` | bind keys, pointer or gamepad actions |
| `src/world.ts` | change movement, coin collection or round duration without graphics |
| `src/save.ts` | change the stored best score |
| `assets/` | replace the player, coin and sound |

For a first change, set `ROUND` in `src/world.ts` to 15 and run again. The
existing `tests/world.test.ts` checks the rules without opening a window.

## Drive scenes from one frame loop

A scene extends `Scene` and implements hooks. The template's `PlayScene.enter()`
creates a fresh seeded world; `update(seconds)` moves it and requests the next
scene when time expires; `draw()` draws it. `OverScene.enter()` records the
finished round's score. The controller runs these hooks:

```ts
import { onFrame } from 'zinc:gfx';
import { SceneController } from 'zinc:game';
import { PlayScene } from './scenes';
import { readInput } from './input';

const play = new SceneController(new PlayScene());
play.start();
onFrame((seconds: number) => {
  readInput();
  play.update(seconds);
  play.draw();
});
```

This excerpt runs one scene. Keep the generated `main.ts` to get title and
game-over transitions: it finishes update and draw, stops the old controller,
then starts the requested controller. Do not call a controller recursively
inside its own hook. Stop/start invokes leave/enter again; put round reset in
enter and release scene-owned resources in leave. Hook errors propagate; the
[reference](../reference/game.md) describes the controller state after errors.

## Draw static sprites and read actions

The template's sprite asset rule packs its SVGs into the `sprites` atlas.
A `Sprite` wraps a frame, with position and drawing properties:

```ts
import { atlas } from 'zinc:sprite';
import { Sprite } from 'zinc:game';
const player = new Sprite(atlas('sprites').frame('player.svg'));
player.width = 32;
player.height = 32;
// In draw(), after clearing the frame:
player.x = 100;
player.y = 80;
player.draw();
```

No update is needed for static art. Zero width/height uses the frame size;
rotation is radians. See [sprites](../plugins/sprite.md) for trim, pivot,
batching, PNG and Aseprite imports.

`src/input.ts` creates an `InputActions` collection. Its bindings combine
keyboard and gamepad input into a strength from 0 to 1:

```ts
import { InputActions } from 'zinc:game';
import { GamepadAxis } from 'zinc:gfx';
const actions = new InputActions();
const right = actions.add().key('ArrowRight').key('d')
  .axis(0, GamepadAxis.LeftX, 1);
// Once per frame, before game logic:
actions.update();
// right.value is analog strength; right.pressed is the start edge.
```

Use `pressed` for a one-time action, `down` or `value` for movement. Repeated
queries do not consume edges. The template also retains `Btn` queries for
console controls and pointer steering. Its single input reader owns the
signal queue and calls `actions.reset()` on `focus 0`, so a lost key-up cannot
leave a character moving. Reset on a new round too if that game's policy is
to forget held keys; pointer/gamepad state is sampled again next frame.

## Add animation or a scrolling world when needed

Coin Rush uses static sprites on one screen. For an atlas with an animation
named `hero_run`, attach a clock and advance the sprite in update:

```ts
import { atlas } from 'zinc:sprite';
import { Sprite, Playback } from 'zinc:game';
const run = atlas('game').animation('hero_run');
const hero = new Sprite(run.frameAt(0));
hero.playback = new Playback(run); // loops by default
// In update(seconds): hero.update(seconds);
// In draw(): hero.draw();
```

Animation durations are milliseconds in the atlas; update receives seconds.
For a one-shot, pass `false` to Playback; Finished holds the final frame.
`restart()` returns to time zero, `pause()`/`resume()` preserve elapsed time.

For a larger level, add a Tiled `.tmj` or LDtk `.ldtk` file and an asset rule
`{ "match": "levels/**/*.{tmj,ldtk}", "as": "tilemap" }`:

```ts
import { Camera, loadTileMap } from 'zinc:game';
const room = loadTileMap('levels/world.ldtk').level('Level_1');
const camera = new Camera(640, 400);
camera.bounds(2000, 800); // your level's world dimensions
// In update(): camera.follow(heroWorldX, heroWorldY);
// In draw(): room.draw(camera.viewX, camera.viewY, 640, 400);
// Draw each sprite at (worldX - camera.viewX, worldY - camera.viewY).
```

Keep game positions in world coordinates; subtract the camera only for
rendering. Bounds clamp the camera, or center a world smaller than its viewport.
Shake is optional: call `shake(seconds, amplitude)`, then `update(seconds)`
each frame. Skip shake for reduced motion; `reset()` clears it immediately.
See [tilemaps](../plugins/tilemap.md) for layers, objects, parallax and ownership.

## Use audio and physics directly

The template loads `coin.wav` once with `zinc:audio.load` and calls `play()`
when the score increases. Plays overlap. A missing file produces a silent
Sound with `ok === false` and an `error`; a headless run uses silent output.
For scene-owned music, stop/unload it or close its stream in leave. Read the
[audio reference](../plugins/audio.md) for looping, volume and voice control.

Coin Rush only needs rectangle overlaps. When a game needs rigid bodies,
use `zinc:physics2d` directly and step with a fixed duration rather than the
frame's varying duration. For example, inside a scene:

```ts
import { World, Shape } from 'zinc:physics2d';
const world = new World();
const ball = world.body(Shape.circle(0.5), { position: [0, 4] });
let pending = 0;
function update(seconds: number): void {
  pending += Math.min(seconds, 0.1);
  while (pending >= 1 / 60) {
    world.step(1 / 60);
    pending -= 1 / 60;
  }
}
// Read ball.x / ball.y after stepping; map metres to pixels for drawing.
// On scene leave: world.destroy(); on re-entry: create a new world and reset pending.
```

The cap deliberately drops long pauses instead of simulating an unbounded
backlog. Physics defaults to y-up gravity; screen pixels are y-down. Choose a
scale and convert at drawing. Worlds own their bodies and joints: destroy the
world on exit, and clean up partial setup if enter throws. See
[physics2d](../plugins/physics2d.md) for units, contacts and target support.
No 500-body or frame-rate guarantee is implied by this example.

Continue with the [API reference](../reference/game.md), the
[platformer](../../examples/platformer/README.md), or
[distribution](07-distribution.md) to export your game.
