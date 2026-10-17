// Meadow Run: a small side-scrolling platformer for the desktop and the consoles (PSP, PS Vita, PS2, 3DS), one source.
// The level is an LDtk project and the sprites a sheet, both packed into one 256x256 atlas by the asset build.
// `--log` prints what happens (the test's record), `--stats` the tiles and sprites drawn and the draw commands.
import { onFrame, commandCount, imageWidth, imageHeight } from 'zinc:gfx';
import { atlas } from 'zinc:sprite';
import { args, clock } from 'zinc:sys';
import { load } from 'zinc:tilemap';
import { Controls, readControls } from './input';
import { World, Phase, STEP } from './world';
import { View, draw, stats } from './render';
import { playSounds } from './sound';

const level = load('level.ldtk').level();
const world = new World(level);
const back = level.layer('Back'), front = level.layer('Front');
const view = new View();
const controls = new Controls();
const logging = args().indexOf('--log') >= 0, measuring = args().indexOf('--stats') >= 0;
let frames: i32 = 0, idle = 0, spent = 0, worst = 0;   // spent, worst: ms of the program's own work (--stats)
if (measuring) for (const p of atlas('game').pages) console.log(`stats atlas page ${imageWidth(p)}x${imageHeight(p)}`);

onFrame((dt: number) => {
  const t0 = measuring ? clock() : 0;
  readControls(controls);
  // fixed steps: one per 1/60 s of the frame (two at 30 fps), at most four after a stall
  const steps = Math.max(1, Math.min(4, Math.round(dt / STEP)));
  for (let i = 0; i < steps; i++) {
    const was = world.phase;
    world.step(controls);
    controls.jumpPressed = false;   // a press counts once
    controls.start = false;
    if (logging) for (const e of world.events) console.log(`${world.steps} ${e} x ${Math.floor(world.hero.x)} y ${Math.floor(world.hero.y)} score ${world.score} lives ${world.lives}`);
    playSounds(world.events, world.phase);
    if (was === Phase.Title && world.phase === Phase.Play) view.follow(world, true);
  }
  if (world.phase === Phase.Title) {   // the title screen drifts over the level
    idle += dt;
    world.hero.x = 160 + (1 - Math.cos(idle * 0.15)) * 700;
    world.hero.facing = 1;
  }
  view.follow(world, frames === 0);
  draw(world, view, back, front);
  frames++;
  if (!measuring) return;
  const ms = clock() - t0;
  spent += ms; worst = Math.max(worst, ms);
  if (frames % 60 === 0) {
    console.log(`stats frame ${frames} tiles ${stats.tiles} sprites ${stats.sprites} commands ${commandCount()} avg_ms ${(spent / 60).toFixed(3)} max_ms ${worst.toFixed(3)}`);
    spent = 0; worst = 0;
  }
});
