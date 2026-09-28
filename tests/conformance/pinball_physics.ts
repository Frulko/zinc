// Pinball physics (examples/pinball): the table and its fixed-step simulation replay scripted plunger and flipper
// inputs; ball positions, layers and a score from the physics events are printed at fixed steps. The physics is pure
// Zinc (no clock, no randomness), so sim and native print the same bytes in every profile (f64, f32, Q20.12).
import { Table } from '../../examples/pinball/src/table/layout';
import { E_SENSOR, E_PORTAL, E_CAPTURE, E_DRAIN } from '../../examples/pinball/src/physics/world';
import { K_BUMPER, K_SLING, K_TARGET, K_FLIPPER } from '../../examples/pinball/src/physics/bodies';

const STEP: number = 1 / 960;
const table = new Table(3);
const w = table.world;
let score: i32 = 0;
let hits: i32 = 0;

function f(v: number): string { return (Math.round(v * 100) / 100).toFixed(2); }

/** Flipper script: [start, end) windows in substeps for the left and right buttons. */
const LEFT: i32[] = [0, 2300, 3900, 3960, 5200, 5600, 7000, 7300];
const RIGHT: i32[] = [2900, 3150, 4400, 4800, 6100, 6180, 7600, 7900];
function held(windows: i32[], step: i32): boolean {
  for (let i: i32 = 0; i < windows.length; i += 2) if (step >= windows[i] && step < windows[i + 1]) return true;
  return false;
}

w.place(w.balls[0], 19.72, 39.6);
w.place(w.balls[1], 8.2, 33.5);       // a second ball dropped on the raised left flipper: a cradle, then a flip
for (let step: i32 = 0; step <= 9600; step++) {
  w.pulling = step >= 60 && step < 900;
  if (step === 6000) { w.place(w.balls[2], 13.7, 24.0); w.balls[2].vy = -95; }   // a shot up the ramp (layers 1 and 2)
  table.left.pressed = held(LEFT, step);
  table.right.pressed = held(RIGHT, step);
  w.step(STEP);
  for (let i: i32 = 0; i < w.nevents; i++) {
    const e = w.events[i];
    hits++;
    if (e.kind === K_BUMPER) score += 100;
    else if (e.kind === K_SLING) score += 10;
    else if (e.kind === K_TARGET) { score += 500; table.setTarget(e.tag, false); }
    else if (e.kind === E_SENSOR) score += 50;
    else if (e.kind === E_PORTAL) score += 250;
    else if (e.kind === E_CAPTURE) { score += 1000; w.eject(w.balls[e.ball], 30, 40); }
    else if (e.kind === E_DRAIN) console.log(`step ${step}: ball ${e.ball} drained`);
    else if (e.kind === K_FLIPPER) score += 1;
  }
  w.nevents = 0;
  if (step % 480 === 0 || (step > 6000 && step < 7500 && step % 120 === 0)) {
    let line = `t=${f(step * STEP)} score=${score} hits=${hits} flip=${f(table.left.angle)},${f(table.right.angle)} plunger=${f(w.plungerPull)}`;
    for (const b of w.balls) if (b.active) line += ` | b${b.id} ${f(b.x)},${f(b.y)} z=${f(b.z)} v=${f(b.vx)},${f(b.vy)} L${b.layer}`;
    console.log(line);
  }
}
console.log(`final score ${score}, ${w.activeBalls()} ball(s) left`);
