// A small fast ball never goes through things (tests/t1/physics3d.sh): 10,000 scripted shots of a 27 mm ball at 3 to
// 20 m/s against a 2 mm wall, a mesh ramp, a flipper that sweeps at 40 rad/s, and another ball coming the other way.
// The unit is the centimetre (radius 1.35, speed 2000), the step 1/240 s: at full speed the ball moves 8.3 cm a step,
// six times its radius, so only continuous collision stops it. Every shot is checked at every step, and every shot
// must reach its target. Two rules of docs/plugins/physics3d.md are applied where they matter:
// - a kinematic body that sweeps into a ball needs short steps: the flipper runs 4 collision steps per step (960 Hz);
//   at 1 (240 Hz) 2 shots of the 2,500 go through, a slow ball caught by the blade;
// - two continuous bodies flying at each other are only swept against where the other was: the balls take as many
//   collision steps as keep their closing distance per step under half a radius.
import { World, Shape, Body, Motion } from 'zinc:physics3d';

const R = 1.35, V = 2000, DT = 1 / 240, STEPS = 48, SHOTS = 2500;

// Park-Miller: the same shots on every run and every engine (the products stay exact in a double)
let seed: number = 20261010;
function rnd(): number { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
function between(a: number, b: number): number { return a + (b - a) * rnd(); }
/** Mostly full speed, some slow balls too (a slow ball in front of a fast flipper is its own case). */
function speed(): number { return rnd() < 0.7 ? V : between(300, V); }

function ball(w: World): Body {
  return w.body(Shape.sphere(R), { continuous: true, restitution: 0.5, friction: 0.2, linearDamping: 0, angularDamping: 0, sleeping: false, maxSpeed: 4 * V, maxAngularSpeed: 4000 });
}
/** Puts the ball at (x, y, z) flying towards (tx, ty, tz) at speed v. */
function fire(b: Body, x: number, y: number, z: number, tx: number, ty: number, tz: number, v: number): void {
  const dx = tx - x, dy = ty - y, dz = tz - z, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  b.setTransform(x, y, z, 0, 0, 0, 1);
  b.setAngularVelocity(0, 0, 0);
  b.setVelocity(dx / l * v, dy / l * v, dz / l * v);
}

// ---- a wall 2 mm thick across z = 0: the ball starts at z < 0 and its centre must never reach the other side
function wall(): string {
  const w = new World({ gravity: [0, 0, 0], maxBodies: 16 });
  w.body(Shape.box(15, 15, 0.1), { motion: Motion.Static, restitution: 0.5 });
  const b = ball(w);
  let through = 0, hits = 0;
  for (let s = 0; s < SHOTS; s++) {
    fire(b, between(-10, 10), between(-10, 10), -between(20, 50), between(-12, 12), between(-12, 12), 0, speed());
    let bad = false;
    for (let i = 0; i < STEPS; i++) { w.step(DT); if (b.z > 0) bad = true; }
    if (bad) through++;
    if (b.vz < 0) hits++;
  }
  w.destroy();
  return `wall: ${SHOTS} shots, ${hits} hits, ${through} through`;
}

// ---- a ramp: two triangles rising along z; the ball comes from above and must stay above the plane while over the ramp
function ramp(): string {
  const w = new World({ gravity: [0, 0, 0], maxBodies: 16 });
  w.body(Shape.mesh([-15, 0, -15, 15, 0, -15, 15, 10, 15, -15, 10, 15], [0, 3, 1, 1, 3, 2]), { motion: Motion.Static, restitution: 0.5 });
  const b = ball(w);
  const ny = 0.9486832980505138, nz = -0.31622776601683794;   // the unit normal of the plane, upwards
  let through = 0, hits = 0;
  for (let s = 0; s < SHOTS; s++) {
    const tx = between(-12, 12), tz = between(-12, 12), ty = (tz + 15) / 3, h = between(20, 50);
    fire(b, tx + between(-10, 10), ty + ny * h, tz + nz * h + between(-10, 10), tx, ty, tz, speed());
    let bad = false, away = false;
    for (let i = 0; i < STEPS; i++) {
      w.step(DT);
      const above = b.y * ny + (b.z + 15) * nz;   // signed distance to the plane through (0, 0, -15)
      if (above < 0 && Math.abs(b.x) < 14 && Math.abs(b.z) < 14) bad = true;
      if (b.vy * ny + b.vz * nz > 0) away = true;
    }
    if (bad) through++;
    if (away) hits++;
  }
  w.destroy();
  return `ramp: ${SHOTS} shots, ${hits} hits, ${through} through`;
}

// ---- a flipper 7 cm long and 1.2 cm thick, pivoting at the origin around y, driven as a kinematic body through a
// stroke of 1 radian at 40 rad/s, back and forth. In the flipper's own frame the ball starts in front (z < 0): its centre
// must never be found behind the blade, nor deep inside it, while it is alongside it.
function flipper(): string {
  const w = new World({ gravity: [0, 0, 0], maxBodies: 16 });
  const blade = w.body(Shape.box(3.5, 1, 0.6), { motion: Motion.Kinematic, position: [3.5, 0, 0], restitution: 0.5 });
  const b = ball(w);
  let through = 0, hits = 0;
  for (let s = 0; s < SHOTS; s++) {
    let angle = between(-0.5, 0.5), turn = rnd() < 0.5 ? 40 : -40;
    blade.setTransform(3.5 * Math.cos(angle), 0, -3.5 * Math.sin(angle), 0, Math.sin(angle / 2), 0, Math.cos(angle / 2));
    fire(b, between(0, 7), 0, -between(15, 35), between(1, 6), 0, 0, speed());
    let bad = false, hit = false, wasFront = false;
    for (let i = 0; i < STEPS; i++) {
      angle += turn * DT;
      if (angle > 0.5) { angle = 0.5; turn = -40; } else if (angle < -0.5) { angle = -0.5; turn = 40; }
      blade.moveTo(3.5 * Math.cos(angle), 0, -3.5 * Math.sin(angle), 0, Math.sin(angle / 2), 0, Math.cos(angle / 2), DT);
      w.step(DT, 4);
      // the ball in the blade's frame: x along the blade from its centre, z across it
      const a = 2 * Math.atan2(blade.qy, blade.qw), c = Math.cos(a), sn = Math.sin(a);
      const rx = b.x - blade.x, rz = b.z - blade.z;
      const lx = rx * c - rz * sn, lz = rx * sn + rz * c;
      const alongside = Math.abs(lx) < 3 && Math.abs(b.y) < 0.7;
      if (alongside && (Math.abs(lz) < 0.3 || (lz > 0 && wasFront))) bad = true;
      wasFront = alongside && lz < 0;
      if (b.vz < 0) hit = true;
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
  const w = new World({ gravity: [0, 0, 0], maxBodies: 16 });
  const a = ball(w), b = ball(w);
  let through = 0, hits = 0;
  for (let s = 0; s < SHOTS; s++) {
    const ay = between(-0.3, 0.3), az = between(-0.3, 0.3), ax = -between(20, 50), bx = between(20, 50);
    fire(a, ax, ay, az, bx, 0, 0, speed());
    fire(b, bx, 0, 0, ax, ay, az, speed());
    const before = a.vx;
    let bad = false;
    for (let i = 0; i < STEPS; i++) {
      const rvx = a.vx - b.vx, rvy = a.vy - b.vy, rvz = a.vz - b.vz;
      const n: i32 = Math.max(1, Math.ceil(Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz) * DT / (0.5 * R)));
      w.step(DT, n);
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      if (dx < 0 || dx * dx + dy * dy + dz * dz < R * R) bad = true;
    }
    if (bad) through++;
    if (Math.abs(a.vx - before) > 1) hits++;
  }
  w.destroy();
  return `balls: ${SHOTS} shots, ${hits} hits, ${through} through`;
}

console.log(wall());
console.log(ramp());
console.log(flipper());
console.log(balls());
