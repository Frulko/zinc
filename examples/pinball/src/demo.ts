// ZINC_DEMO=<state> (or `-- --demo=<state>`): scripted states for screenshots and the benchmark. The game plays
// itself (the attract-mode player) so every run of a state is the same, frame for frame.
//   attract     the title with the demo ball (the default without ZINC_DEMO, after start-up)
//   playing     a game in progress, one ball
//   multiball   three balls, jackpot lit
//   tilt        a tilted table
//   highscore   the initials entry after a record
//   pause       the pause menu over a game
//   bench       prints frame times of a deterministic ball run (attract, play, multiball), then quits;
//               run it with ZINC_FIXED_DT=0.016667 so the simulation is the same on every machine
import { env, args, clock } from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { Game } from './game/game';
import { Menu } from './ui/menu';

function demoState(): string {
  for (const a of args()) if (a.startsWith('--demo=')) return a.slice(7);
  return env('ZINC_DEMO');
}
export const demo: string = demoState();

let frame: i32 = 0;

/** Called once per frame before the game updates. */
export function stepDemo(g: Game, menu: Menu): void {
  frame++;
  if (demo === '' || demo === 'attract') return;
  if (frame === 1) {
    g.startGame(1);
    g.autopilot = true;
    if (demo === 'bench') g.player.extraBalls = 99;   // the benchmark never runs out of balls
    g.autoLaunch();
    if (demo === 'multiball' || demo === 'pause' || demo === 'tilt') { g.player.score = 184250; g.player.rank = 3; g.player.missionsDone = 3; g.player.mission = 3; g.player.bonusX = 3; }
    if (demo === 'highscore') { for (const b of g.world.balls) b.active = false; g.player.score = 523450; g.beginEntry(0); g.entryName[0] = 25; g.entryName[1] = 8; g.entryPos = 2; g.entryName[2] = 13; }
  }
  if (demo === 'multiball' && frame === 150) { g.player.holeSinks = 3; g.startMultiball(); }
  if (demo === 'tilt' && frame === 200) g.tilt();
  if (demo === 'pause' && frame === 240) menu.show();
  if (demo === 'bench') bench(g);
}

const PHASES: string[] = ['play (1 ball)', 'multiball (3 balls)', 'attract (light chase)'];
const PHASE_FRAMES: i32 = 900;
let last: number = 0, sum: number = 0, worst: number = 0, count: i32 = 0, over: i32 = 0;
let updateMs: number = 0, drawMs: number = 0;
/** main.ts reports how long the rules + physics and the scene recording took this frame. */
export function setTimes(update: number, draw: number): void { updateMs = update; drawMs = draw; }
let upSum: number = 0, drSum: number = 0;

function bench(g: Game): void {
  const phase: i32 = Math.floor((frame - 2) / PHASE_FRAMES), k: i32 = (frame - 2) % PHASE_FRAMES;
  if (frame < 2) return;
  if (phase >= PHASES.length) { quit(); return; }
  const now = clock();
  if (k === 0) {
    if (phase === 1) { g.player.holeSinks = 3; g.startMultiball(); }
    if (phase === 2) g.toAttract();
    sum = 0; worst = 0; count = 0; over = 0; upSum = 0; drSum = 0;
  } else if (k > 30) {
    const ms = now - last;
    sum += ms; worst = Math.max(worst, ms); count++;
    if (ms > 1000 / 120) over++;
    upSum += updateMs; drSum += drawMs;
  }
  last = now;
  if (k === PHASE_FRAMES - 1) {
    console.log(`${PHASES[phase].padEnd(22)} frame avg ${(sum / count).toFixed(2)} ms  max ${worst.toFixed(1)} ms  over 8.3 ms: ${over}/${count}  | rules+physics ${(upSum / count).toFixed(3)} ms  scene record ${(drSum / count).toFixed(3)} ms  balls ${g.world.activeBalls()}  score ${g.player.score}`);
  }
}
