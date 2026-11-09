# gestures plugin (`zinc:gestures`)

Touch and mouse gestures on `zinc:gfx` input, in plain TypeScript, on every target. Two levels:

- `Gestures`: one region, one gesture at a time. Pan, zoom and rotate from a mouse drag, the wheel, a trackpad pinch or two fingers, with
  tap, double tap and the release velocity. The map plugin uses it ([map](map.md)).
- `Fingers`, `Pose`, `manipulate` and `glide`: several things under several hands. Each finger belongs to the thing it landed on until it
  lifts, and each thing is dragged, turned and zoomed by its own fingers, then coasts on when they let go. The light table of
  `examples/museum-table` works this way.

## Several things under several hands

```ts
import { onFrame, clear, rect } from 'zinc:gfx';
import { Fingers, Pose, manipulate, glide } from 'zinc:gestures';

class Card { pose = new Pose(); id: i32; w = 200; h = 140; constructor(id: i32, x: number, y: number) { this.id = id; this.pose.x = x; this.pose.y = y; } }
const cards = [new Card(1, 300, 300), new Card(2, 700, 400)];
const fingers = new Fingers();

onFrame((dt: number) => {
  fingers.update(dt);                                     // touch points, or the mouse as one finger
  for (const f of fingers.down) {                         // a finger that just landed takes the card under it
    if (!f.fresh || f.owner !== 0) continue;
    for (const c of cards) if (Math.abs(f.x - c.pose.x) < c.w / 2 && Math.abs(f.y - c.pose.y) < c.h / 2) { f.owner = c.id; break; }
  }
  clear(0x202020);
  for (const c of cards) {
    const held = fingers.of(c.id);
    if (held.length > 0) manipulate(c.pose, held, 0.5, 3, dt);   // one finger drags, two drag, turn and zoom (scale kept in 0.5..3)
    else glide(c.pose, dt);                                       // released: it slides on and slows down
    const s = c.pose.scale;
    rect(c.pose.x - c.w * s / 2, c.pose.y - c.h * s / 2, c.w * s, c.h * s, 0xe0d8c0);   // draw it turned by c.pose.angle in a real app
  }
  for (const f of fingers.lifted) if (f.tapped) { /* a short press in place on the card f.owner */ }
});
```

- `Fingers.update(dt, ox = 0, oy = 0, k = 1, left, top, wide, high)`: reads the frame's touch points (or the mouse, as the finger `MOUSE`,
  when no touch screen was touched for half a second: a touch screen's taps also arrive as mouse presses). Positions are given in a plane
  whose origin is at `(ox, oy)` on the screen and whose unit is `k` pixels; a finger counts only when it lands inside the box `left, top,
  wide, high` of that plane (all of it by default), and one that landed beside stays nobody's even when it slides in.
- `down` (in landing order) and `lifted` (this frame): `Finger`s with `x, y`, the previous `px, py`, `age` (seconds), `travel`, `fresh` (the
  frame it lands), `owner` (0 until a target takes it: set it on a fresh finger) and `tapped` (lifted after less than 0.35 s and 14 units).
  `of(owner)`: the fingers of one target.
- `Pose`: `x, y` (centre), `scale`, `angle` (radians), and the speed `vx, vy, va` it would leave its fingers with.
- `manipulate(pose, held, smallest, largest, dt = 0)`: one finger drags; two drag, turn and zoom about their midpoint (more than two: the
  first two). Only the fingers' motion since the previous frame counts, never their positions, so a finger that lands or lifts in the middle
  of a gesture never makes the thing jump. With `dt` it also follows the speed, smoothed over a few frames (a pause before the release
  leaves little of it).
- `glide(pose, dt, friction = 4, spin = 6, rest = 4)`: inertia. The pose moves on with its speed, which friction spends per second
  (`friction` for the slide, `spin` for the turn) until it falls under `rest` units per second. Set `vx, vy, va` to 0 to stop it at once.

## One region: `Gestures`

```ts
import { Gestures } from 'zinc:gestures';
const g = new Gestures();
onFrame((dt: number) => {
  g.update(dt, 0, 0, width(), height());   // gestures start only inside this region
  panX += g.dx; panY += g.dy; zoom *= g.scale; turn += g.rotate;
  if (g.released) { /* g.vx, g.vy: release velocity in px/s */ }
  if (g.doubleTap) zoom *= 2;
});
```

Fields, all for this frame: `dx, dy`, `scale`, `rotate`, the focus `x, y`, `active`, `released` with `vx, vy`, `tap`, `doubleTap`, and
`wheelStep` (zoom per wheel notch, 1.25).
