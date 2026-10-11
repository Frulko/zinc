// A small fast ball never goes through things (tests/t1/physics2d.sh): 10,000 scripted shots of a 27 mm ball at 3 to
// 20 m/s against a 2 mm wall, a segment, a flipper swung by its revolute motor at 40 rad/s, and another ball coming the
// other way. The unit is the centimetre (radius 1.35, speed 2000), the step 1/240 s: at full speed the ball moves 8.3 cm a
// step, six times its radius, so only continuous collision stops it. Every shot is checked at every step, and every shot
// must reach its target. The ball is `continuous` (a Box2D bullet: swept against the flipper too). Two rules of
// docs/plugins/physics2d.md are applied where they matter:
// - a body that moves into the ball is seen at its end-of-step pose: the flipper scene steps at 960 Hz (4 x 240), so that
//   the blade's tip moves less than half a radius a step; at 240 Hz 1 shot of the 2,500 goes through, at 480 Hz none;
// - Box2D never sweeps a bullet against another bullet: two balls flying at each other take as many short steps as keep
//   their closing distance per step under half a radius.
import { World, Shape, Body, Motion, Motor } from 'zinc:physics2d';

const R = 1.35, V = 2000, DT = 1 / 240, STEPS = 48, SHOTS = 2500;

// Park-Miller: the same shots on every run and every engine (the products stay exact in a double)
let seed: number = 20261011;
function rnd(): number { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
function between(a: number, b: number): number { return a + (b - a) * rnd(); }
/** Mostly full speed, some slow balls too (a slow ball in front of a fast flipper is its own case). */
function speed(): number { return rnd() < 0.7 ? V : between(300, V); }

function world(): World { return new World({ gravity: [0, 0], maxSpeed: 4 * V }); }
function ball(w: World): Body {
  return w.body(Shape.circle(R), { continuous: true, restitution: 0.5, friction: 0.2, sleeping: false, events: true });
}
/** Puts the ball at (x, y) flying towards (tx, ty) at speed v. */
function fire(b: Body, x: number, y: number, tx: number, ty: number, v: number): void {
  const dx = tx - x, dy = ty - y, l = Math.sqrt(dx * dx + dy * dy);
  b.setTransform(x, y, 0);
  b.setAngularVelocity(0);
  b.setVelocity(dx / l * v, dy / l * v);
}

// ---- a wall across y = 0, 2 mm thick (a box) or a segment: the ball starts at y < 0 and its centre must never reach the other side
function wall(name: string, shape: Shape): string {
  const w = world();
  w.body(shape, { motion: Motion.Static, restitution: 0.5 });
  const b = ball(w);
  let through = 0, hits = 0;
  for (let s = 0; s < SHOTS; s++) {
    fire(b, between(-10, 10), -between(20, 50), between(-12, 12), 0, speed());
    let bad = false;
    for (let i = 0; i < STEPS; i++) { w.step(DT); if (b.y > 0) bad = true; }
    if (bad) through++;
    if (b.vy < 0) hits++;
  }
  w.destroy();
  return `${name}: ${SHOTS} shots, ${hits} hits, ${through} through`;
}

// ---- a flipper 7 cm long and 1.2 cm thick on a revolute joint at the origin, its motor (a torque up to 1e6)
// swinging it through 1 radian at 40 rad/s, back and forth. In the flipper's own frame the ball starts in front (y < 0):
// its centre must never be found behind the blade, nor deep inside it, while it is alongside it. A hit is a contact event.
function flipper(): string {
  const w = world();
  const blade = w.body(Shape.box(3.5, 0.6, 3.5, 0), { sleeping: false, restitution: 0.5, density: 2 });
  const hinge = w.revolute(blade, null, [0, 0], { min: -0.5, max: 0.5 });
  const b = ball(w);
  let through = 0, hits = 0;
  for (let s = 0; s < SHOTS; s++) {
    const angle = between(-0.5, 0.5);
    let turn = rnd() < 0.5 ? 40 : -40;
    blade.setTransform(0, 0, angle);
    blade.setAngularVelocity(turn);
    hinge.motor(Motor.Velocity, turn, 1e6);
    fire(b, between(0, 7), -between(15, 35), between(1, 6), 0, speed());
    let bad = false, hit = false, wasFront = false;
    for (let i = 0; i < STEPS; i++) {
      for (let k = 0; k < 4; k++) {
        const a = hinge.value();
        if ((a >= 0.5 && turn > 0) || (a <= -0.5 && turn < 0)) { turn = -turn; hinge.motor(Motor.Velocity, turn, 1e6); }
        w.step(DT / 4);
        if (w.contacts.length > 0) hit = true;
      }
      // the ball in the blade's frame: x along the blade from its centre, y across it
      const c = Math.cos(blade.angle), sn = Math.sin(blade.angle);
      const lx = b.x * c + b.y * sn - 3.5, ly = -b.x * sn + b.y * c;
      const alongside = Math.abs(lx) < 3;
      if (alongside && (Math.abs(ly) < 0.3 || (ly > 0 && wasFront))) bad = true;
      wasFront = alongside && ly < 0;
    }
    if (bad) through++;
    if (hit) hits++;
  }
  w.destroy();
  return `flipper: ${SHOTS} shots, ${hits} hits, ${through} through`;
}

// ---- two balls thrown at each other, almost head on (closing at up to 40 m/s): the one on the left stays on the left,
// and their centres never come closer than a radius
function balls(): string {
  const w = world();
  const a = ball(w), b = ball(w);
  let through = 0, hits = 0;
  for (let s = 0; s < SHOTS; s++) {
    const ay = between(-0.3, 0.3), ax = -between(20, 50), bx = between(20, 50);
    fire(a, ax, ay, bx, 0, speed());
    fire(b, bx, 0, ax, ay, speed());
    const before = a.vx;
    let bad = false;
    for (let i = 0; i < STEPS; i++) {
      const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
      const n: i32 = Math.max(1, Math.ceil(Math.sqrt(rvx * rvx + rvy * rvy) * DT / (0.5 * R)));
      for (let k = 0; k < n; k++) w.step(DT / n);
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx < 0 || dx * dx + dy * dy < R * R) bad = true;
    }
    if (bad) through++;
    if (Math.abs(a.vx - before) > 1) hits++;
  }
  w.destroy();
  return `balls: ${SHOTS} shots, ${hits} hits, ${through} through`;
}

console.log(wall('wall', Shape.box(15, 0.1)));
console.log(wall('segment', Shape.segment(-15, 0, 15, 0)));
console.log(flipper());
console.log(balls());
