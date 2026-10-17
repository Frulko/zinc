// Marble Terraces: a small 3D marble course for the desktop and the consoles (PSP, PS Vita, PS2, 3DS), one source.
// Tilt the board, roll the marble down the terraces to the ring and pick up the gems before the clock runs out.
// `--log` prints what happens (the test's record), `--stats` the triangles, draw calls and ms per frame, `--autopilot`
// plays by itself and prints the d-pad it holds as ZINC_INPUT lines (src/autopilot.ts).
import { onFrame } from 'zinc:gfx';
import { args, clock } from 'zinc:sys';
import { load } from 'zinc:tilemap';
import { Course, STEP } from './course';
import { Controls, readControls } from './input';
import { View, hud, stats } from './scene';
import { playSounds, rollSound } from './sound';
import { Autopilot } from './autopilot';

const course = new Course(load('level.ldtk').level());
const view = new View(course);
const controls = new Controls();
const logging = args().indexOf('--log') >= 0, measuring = args().indexOf('--stats') >= 0;
const pilot = args().indexOf('--autopilot') >= 0 ? new Autopilot() : null;
let frames: i32 = 0, spent = 0, worst = 0, maxTris: i32 = 0, maxDraws: i32 = 0;

onFrame((dt: number) => {
  const t0 = measuring ? clock() : 0;
  if (pilot !== null) pilot.drive(course, frames);
  readControls(controls, dt, pilot);
  // 120 physics steps a second: two per frame at 60 fps, four at 30, at most eight after a stall
  const steps = Math.max(1, Math.min(8, Math.round(dt / STEP)));
  for (let i = 0; i < steps; i++) {
    course.step(controls.tiltX, controls.tiltZ, controls.start);
    controls.start = false;   // a press counts once
    const b = course.ball;
    if (logging) for (const e of course.events) console.log(`${course.steps} ${e} x ${b.x.toFixed(2)} y ${b.y.toFixed(2)} z ${b.z.toFixed(2)} gems ${course.taken} lives ${course.lives} time ${Math.ceil(course.time)}`);
    playSounds(course.events);
  }
  rollSound(course);
  view.draw(course, controls.tiltX, controls.tiltZ, dt);
  hud(course);
  frames++;
  if (!measuring) return;
  const ms = clock() - t0;
  spent += ms; worst = Math.max(worst, ms);
  maxTris = Math.max(maxTris, stats.triangles); maxDraws = Math.max(maxDraws, stats.draws);
  if (frames % 60 === 0) {
    console.log(`stats frame ${frames} triangles ${maxTris} draws ${maxDraws} avg_ms ${(spent / 60).toFixed(3)} max_ms ${worst.toFixed(3)}`);
    spent = 0; worst = 0; maxTris = 0; maxDraws = 0;
  }
});
