// Physics feel: the numbers behind the tuning. Flip speeds and directions from four spots on the left flipper,
// a cradle on the raised flipper, the speed a shot needs to make the ramp, and plunger power.
//   zinc run examples/pinball/tools/feel.ts --target sim
import { Table, P_WIRE_OUT } from '../src/table/layout';
import { E_PORTAL } from '../src/physics/world';

const STEP = 1 / 960;
function f(v: number): string { return v.toFixed(1); }

// 1. flip shots: ball resting on the held-down left flipper at distance d from the pivot, then flip
for (const d of [1.2, 1.8, 2.4, 2.9]) {
  const t = new Table(1), w = t.world, fl = t.left, b = w.balls[0];
  w.place(b, fl.px + Math.cos(fl.rest) * d, fl.py + Math.sin(fl.rest) * d - 0.53 - fl.r0 + 0.05);
  for (let i = 0; i < 20; i++) w.step(STEP);
  fl.pressed = true;
  let maxv = 0, ang = 0;
  for (let i = 0; i < 120; i++) { w.step(STEP); const v = Math.hypot(b.vx, b.vy); if (v > maxv) { maxv = v; ang = Math.atan2(b.vy, b.vx) * 180 / Math.PI; } }
  console.log(`flip at ${d}: speed ${f(maxv)} in/s, direction ${f(ang)} deg, pos ${f(b.x)},${f(b.y)}`);
}
// 2. cradle: flipper held up, ball dropped above it
{
  const t = new Table(1), w = t.world, fl = t.left, b = w.balls[0];
  fl.pressed = true;
  for (let i = 0; i < 100; i++) w.step(STEP);
  w.place(b, 8.2, 33.5);
  for (let i = 0; i < 960 * 3; i++) w.step(STEP);
  console.log(`cradle: ball at ${f(b.x)},${f(b.y)} v ${f(b.vx)},${f(b.vy)} active ${b.active}`);
}
// 3. ramp: ball fired straight up the mouth at a given speed
for (const v of [50, 60, 70, 85, 100, 130]) {
  const t = new Table(1), w = t.world, b = w.balls[0];
  w.place(b, 13.7, 24.0); b.vy = -v;
  let made = false, maxz = 0;
  for (let i = 0; i < 960 * 4 && b.active; i++) {
    w.step(STEP);
    maxz = Math.max(maxz, b.z);
    for (let k = 0; k < w.nevents; k++) if (w.events[k].kind === E_PORTAL && w.events[k].tag === P_WIRE_OUT) made = true;
    w.nevents = 0;
  }
  console.log(`ramp at ${v}: made ${made} max z ${f(maxz)} end ${f(b.x)},${f(b.y)} layer ${b.layer}`);
}
// 4. plunger: full pull, where does the ball go in 1.5 s
for (const pull of [0.3, 0.6, 1.0]) {
  const t = new Table(1), w = t.world, b = w.balls[0];
  w.place(b, 19.72, 39.6);
  let i = 0;
  w.pulling = true;
  while (w.plungerPull < pull) { w.step(STEP); i++; }
  w.pulling = false;
  let miny = 99;
  for (let k = 0; k < 960 * 2; k++) { w.step(STEP); miny = Math.min(miny, b.y); }
  console.log(`plunger ${pull}: top y ${f(miny)}, after 2 s at ${f(b.x)},${f(b.y)}`);
}
