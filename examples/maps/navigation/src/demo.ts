// ZINC_DEMO=<state>: scripted states for screenshots, and a benchmark.
//   preview drive lanes roundabout alert traffic speeding steps report panned night arrive: the app a moment into
//   that state (take the picture with ZINC_FRAMES=90 ZINC_SHOT=out.png);
//   bench: seven 4-second phases along the route (overview, quays, Concorde, Champs-Élysées, the Arc de Triomphe,
//   the jam, night); prints the average and worst frame time of each, then quits;
//   check: self-checks (projection round trip, steps, trip time), prints "check ok".
import { env, args, clock } from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { Projection } from 'zinc:citymap';
import { jumpTo, setSimSpeed, setPlaying, totalTime } from './sim';
import { routeLength, steps } from './route';
import { skipPreview, startApp, toggleNight, toggleSheet } from './app';
import { toggleReport } from './alerts';
import * as ui from 'zinc:ui';
import { mapStats } from './scene';

/** ZINC_DEMO=<state>, or `-- --demo=<state>` (docker targets pass only ZINC_ variables of their own list). */
function demoState(): string {
  for (const a of args()) if (a.startsWith('--demo=')) return a.slice(7);
  return env('ZINC_DEMO');
}
export const demo: string = demoState();

const BENCH_AT: number[] = [-1, 600, 1700, 2400, 3900, 4500, 7400];
const BENCH_NAMES: string[] = ['overview (preview)', 'quays, 30 km/h', 'Place de la Concorde', 'Champs-Élysées', 'Arc de Triomphe', 'traffic jam', 'night, quays'];
const PHASE_FRAMES: i32 = 240;

let frame: i32 = 0;
let last: number = 0, sum: number = 0, worst: number = 0, count: i32 = 0;

function drivingAt(d: number): void { skipPreview(); jumpTo(d); setPlaying(true); }

function bench(): void {
  const phase: i32 = Math.floor((frame - 2) / PHASE_FRAMES), k: i32 = (frame - 2) % PHASE_FRAMES;
  if (phase >= BENCH_AT.length) { quit(); return; }
  const now = clock();
  if (k === 0) {
    if (BENCH_AT[phase] >= 0) drivingAt(BENCH_AT[phase]);
    if (phase === BENCH_AT.length - 1) toggleNight();
    sum = 0; worst = 0; count = 0;
  } else if (k > 20) {   // skip the first frames of a phase (camera jump)
    const ms = now - last;
    sum += ms; worst = Math.max(worst, ms); count++;
  }
  last = now;
  if (k === PHASE_FRAMES - 1) console.log(`${BENCH_NAMES[phase].padEnd(22)} avg ${(sum / count).toFixed(2)} ms  max ${worst.toFixed(1)} ms  ${mapStats()}`);
}

/** ZINC_DEMO=check: the projection round-trips (screen -> world -> screen, with tilt), the route and the speed
 *  profile are consistent; prints "check ok" or the failures, then quits. */
function check(): void {
  let failures: i32 = 0;
  const fail = (what: string): void => { console.log(`check FAILED: ${what}`); failures++; };
  const p = new Projection();
  p.cx = 120; p.cy = -40; p.bearing = 2.1; p.scale = 1.4; p.ax = 600; p.ay = 460; p.tilt = 0.55; p.depth = 640;
  p.update();
  for (let i: i32 = 0; i < 20; i++) {
    const x = 50 + (i * 97) % 900, y = 20 + (i * 53) % 600;
    p.toWorld(x, y); p.project(p.wx, p.wy);
    if (Math.abs(p.x - x) + Math.abs(p.y - y) > 0.01) fail(`projection round trip at ${x},${y}: ${p.x},${p.y}`);
  }
  for (let i: i32 = 1; i < steps.length; i++) if (steps[i].at < steps[i - 1].at) fail(`steps out of order at ${i}`);
  if (Math.abs(steps[steps.length - 1].at - routeLength) > 1) fail('the last step is not the arrival');
  if (totalTime < routeLength / 14 || totalTime > routeLength / 3) fail(`implausible trip time ${totalTime} s`);
  console.log(failures === 0 ? 'check ok' : `check: ${failures} failure(s)`);
  quit();
}

/** Called every frame from main.tsx. */
export function stepDemo(): void {
  frame++;
  if (frame === 1) { startApp(demo === ''); return; }
  if (demo === 'bench') { bench(); return; }
  if (demo === 'check') { check(); return; }
  if (demo === 'panned' && frame >= 40 && frame <= 62) {
    // a real drag through the UI's pointer events (ui test hooks), then two wheel notches out: Recenter shows
    const k = frame - 40;
    ui.pointerAt(760 - k * 8, 260 + k * 10, frame < 62);
    if (frame === 62) ui.wheelAt(700, 300, -2);
  }
  if (frame !== 2 || demo === '' || demo === 'preview') return;
  if (demo === 'drive') drivingAt(1300);
  else if (demo === 'lanes') drivingAt(1850);
  else if (demo === 'roundabout') drivingAt(3870);
  else if (demo === 'alert') drivingAt(3060);
  else if (demo === 'traffic') drivingAt(4290);
  else if (demo === 'speeding') drivingAt(3150);
  else if (demo === 'steps') { drivingAt(2500); toggleSheet(); }
  else if (demo === 'report') { drivingAt(5200); toggleReport(); }
  else if (demo === 'panned') drivingAt(2250);
  else if (demo === 'night') { drivingAt(3000); toggleNight(); }
  else if (demo === 'arrive') { drivingAt(routeLength - 14); setSimSpeed(1); }
}
