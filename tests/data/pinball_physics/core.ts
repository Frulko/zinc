import { World, GRAVITY, MAX_SPEED, PLUNGER_TRAVEL } from '../../../examples/pinball-kit/physics/world';
import { Segment, Circle, Material, Ramp, Sensor, BALL_R, K_WALL, K_BUMPER } from '../../../examples/pinball-kit/physics/bodies';
import { Flipper } from '../../../examples/pinball-kit/physics/flipper';
import { recoil } from '../../../examples/pinball-kit/feedback';
import { Random } from '../../../examples/pinball-kit/random';
import { FixedClock } from '../../../examples/pinball-kit/clock';
import { Table } from '../../../examples/pinball/src/table/layout';
import { rollingGravity, travelSteps, INCH_CM, GRAVITY_CM, SLOPE_DEGREES } from '../../../examples/pinball-kit/tuning';

function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
function speed(x: number, y: number): number { return Math.sqrt(x * x + y * y); }

check(Math.abs(GRAVITY * INCH_CM - rollingGravity(GRAVITY_CM, SLOPE_DEGREES)) < 0.001, 'gravity units');
check(travelSteps(1 / 240, 1, 600) >= 5, 'relative travel bound');
check(recoil(0) === 0 && recoil(1) < 0.00001 && recoil(0.6) > 0.5, 'mechanical recoil');

const random = new Random();
check(Math.abs(random.next() - 1406932606 / 2147483647) < 1e-12, 'repeatable gameplay seed');
check(Math.abs(random.next() - 654583775 / 2147483647) < 1e-12, 'repeatable gameplay sequence');

// One second of rendered time produces the same physical state at 30, 60 and 120 Hz.
let reference = 0;
for (const fps of [30, 60, 120]) {
  const clock = new FixedClock(), w = new World(1), b = w.balls[0];
  w.place(b, 10, 10);
  let total = 0;
  for (let frame = 0; frame < fps; frame++) {
    const steps = clock.advance(1 / fps, 1 / 960);
    for (let i = 0; i < steps; i++) w.step(1 / 960);
    total += steps;
  }
  check(total === 960 && clock.alpha(1 / 960) < 0.0001, 'fixed clock across frame rates');
  if (fps === 30) reference = b.y; else check(Math.abs(b.y - reference) < 0.0001, 'same fall across frame rates');
  w.destroy();
}
{
  const clock = new FixedClock();
  let steps = 0;
  for (let i = 0; i < 20; i++) for (const delta of [0.01, 0.02, 0.005, 0.015]) steps += clock.advance(delta, 1 / 960);
  check(steps === 960, 'uneven frame deltas retain time');
  check(clock.advance(3, 1 / 960) === 96, 'a stalled frame cannot cause unlimited catch-up');
}

// A portal changes collision worlds without granting the ball an extra physics step.
{
  const w = new World(1), plain = new World(1), b = w.balls[0], reference = plain.balls[0];
  w.addRamp(new Ramp('flat test ramp', false).point(10, 10, 0).point(10, 30, 0));
  const portal = new Sensor(9, 19.95, 11, 19.95, 0, 0);
  portal.toLayer = 1; w.sensors.push(portal);
  w.place(b, 10, 20); plain.place(reference, 10, 20); b.vy = -100; reference.vy = -100;
  w.step(0.01); plain.step(0.01);
  check(b.layer === 1 && Math.abs(b.y - reference.y) < 0.001, 'one advance per layer transfer');
  w.destroy(); plain.destroy();
}

// A coarse caller must not skip a wall in a different broadphase cell.
for (const dt of [1 / 240, 1 / 60]) {
  const w = new World(1), b = w.balls[0];
  w.addSegment(new Segment(10, 5, 10, 35, 0, new Material(0.8, 0, 0, 0), K_WALL, 0), 0);
  w.place(b, 6, 20); b.vx = 250;
  for (let i = 0; i < Math.round(0.1 / dt); i++) w.step(dt);
  check(b.x < 10 - BALL_R && b.vx < 0, 'fast wall collision');
}

// Held flippers must stay passive at both desktop and handheld caller rates.
for (const hz of [240, 960]) {
  const table = new Table(1), w = table.world, b = w.balls[0];
  table.left.pressed = true;
  for (let i = 0; i < hz / 10; i++) w.step(1 / hz);
  w.place(b, 8.2, 33.5);
  for (let i = 0; i < hz * 3; i++) w.step(1 / hz);
  check(b.active && b.y > 34 && b.y < 37 && speed(b.vx, b.vy) < 1, 'stable Box2D cradle');
  w.destroy();
}

// The target bank and ramp underside must not form a pocket for a descending ball.
for (const spot of [0, 1]) {
  const table = new Table(1), w = table.world, b = w.balls[0];
  w.place(b, spot === 0 ? 1.13 : 14.89, spot === 0 ? 15.77 : 18.66);
  for (let i = 0; i < 2880 && b.active; i++) w.step(1 / 960);
  check(!b.active || b.y > 24 || speed(b.vx, b.vy) > 2, 'board has no target/ramp pocket');
  w.destroy();
}

// A kick is capped at contact, never one step later.
{
  const w = new World(1), b = w.balls[0];
  w.addCircle(new Circle(10, 20, 1, new Material(0.8, 0, 1000, 1), K_BUMPER, 0), 0);
  w.place(b, 8.5, 20); b.vx = 200;
  w.step(1 / 960);
  check(b.vx < 0 && speed(b.vx, b.vy) <= MAX_SPEED + 0.001, 'bounded bumper impulse');
}

// Opposing fast balls must exchange directions, including with a coarse caller.
{
  const w = new World(2), a = w.balls[0], b = w.balls[1];
  w.place(a, 8, 20); w.place(b, 12, 20); a.vx = 250; b.vx = -250;
  w.step(1 / 60);
  check(a.vx < 0 && b.vx > 0, 'multiball crossing');
}

// The last fraction of a stroke transfers energy; the next held step does not.
{
  const f = new Flipper(6, 37, 3.25, 0.5, 0.22, 0.5, -0.45, 0);
  f.angle = f.up + 0.001; f.omega = -20; f.pressed = true;
  f.update(1 / 960);
  check(f.angle === f.up && f.omega === 0 && f.sweepOmega < 0, 'end-stop stroke velocity');
  f.update(1 / 960);
  check(f.sweepOmega === 0, 'held flipper adds no energy');
}

// A plunger completing its stroke keeps its collision velocity for that interval.
{
  const w = new World(1), b = w.balls[0];
  w.addPlunger(19.2, 20.3, 40.2);
  w.pulling = true;
  for (let i = 0; i < 5; i++) w.step(1 / 960);
  w.pulling = false; w.plungerVel = -100;
  w.place(b, 19.72, 40.2 + w.plungerPull * PLUNGER_TRAVEL - BALL_R - 0.02);
  w.step(1 / 960);
  check(w.plungerPull < 0.01 && b.vy < -1, 'last plunger impulse');
  check(w.plungerPull >= 0 && w.plungerPull * PLUNGER_TRAVEL <= PLUNGER_TRAVEL, 'plunger bounds');
}
// Fast free flight and distant mechanisms need one adapter call; Box2D sweeps the static board.
{
  const w = new World(1), b = w.balls[0];
  const f = new Flipper(6, 37, 3.25, 0.5, 0.22, 0.5, -0.45, 0);
  w.flippers.push(f); f.pressed = true;
  w.place(b, 10, 10); b.vx = MAX_SPEED;
  w.step(1 / 240);
  check(w.lastSubsteps === 1, 'fast ball far from mechanisms avoids redundant CCD subdivisions');
  w.destroy();
}
// Slow balls need a moving-surface guard: bullet CCD is triggered by the ball's own motion.
for (const dt of [1 / 240, 1 / 60]) {
  const w = new World(1), b = w.balls[0];
  const f = new Flipper(6, 37, 3.25, 0.5, 0.22, 0.5, -0.45, 0);
  w.flippers.push(f); f.pressed = true;
  w.place(b, 9, 36.4);
  for (let i = 0; i < Math.round(0.1 / dt); i++) w.step(dt);
  check(b.vy < -5 && b.y < 36.3, 'moving flipper launches initially stationary ball');
  w.destroy();
}
console.log('pinball core: gravity, travel, contacts, multiball, flipper, plunger, recoil passed');
