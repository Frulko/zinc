// Meadow Run 3D: the platformer of examples/platformer made for the Nintendo 3DS's two screens. The top screen plays the level in
// stereoscopic 3D (the far hills behind the screen, the coins in front of it); the bottom screen holds the lives, the score and the whole
// level as a map, and its stylus looks around the level. The rules, the level and the sounds are the platformer's, unchanged.
//   zinc run --simulate n3ds examples/n3ds-platformer     (the second window is the bottom screen)
// Frame: read the controls -> fixed steps of 1/60 s on the left eye's frames -> the camera -> the top screen for this eye; the bottom
// screen's window draws after it.
import { onFrame, openWindow, keep, frame } from 'zinc:gfx';
import { load } from 'zinc:tilemap';
import { World, Phase, STEP } from '../../platformer/src/world';
import { View } from '../../platformer/src/render';
import { Controls } from '../../platformer/src/input';
import { playSounds } from '../../platformer/src/sound';
import { readControls } from './input';
import { drawTop } from './top';
import { Eyes, ProgramTime } from '../../n3ds-kit/stereo';
import { Bottom } from './bottom';
import { BOTTOM_W, BOTTOM_H } from './constants';

const level = load('level.ldtk').level();
const world = new World(level);
const back = level.layer('Back'), front = level.layer('Front');
const view = new View();
const controls = new Controls();
const eyes = new Eyes();
const bottom = new Bottom();
bottom.build(world);
const time = new ProgramTime('n3ds-platformer');
let pending = 0, idle = 0;

onFrame((dt: number) => {
  eyes.read();
  if (eyes.first()) time.refresh();
  time.begin();
  readControls(controls, bottom.tapped);
  bottom.tapped = false;
  pending += dt;
  if (eyes.first()) {   // the world moves on the left eye's frames; the right eye's frame draws the same moment
    let steps = 0;
    while (pending >= STEP * 0.5 && steps < 4) {   // fixed steps: one per 1/60 s, at most four after a stall
      const was = world.phase;
      world.step(controls);
      controls.jumpPressed = false;   // a press counts once
      controls.start = false;
      playSounds(world.events, world.phase);
      if (was === Phase.Title && world.phase === Phase.Play) view.follow(world, true);
      pending -= STEP; steps++;
    }
    if (pending < 0) pending = 0;
    if (world.phase === Phase.Title) {   // the title screen drifts over the level
      idle += STEP * steps;
      world.hero.x = 160 + (1 - Math.cos(idle * 0.15)) * 700;
      world.hero.facing = 1;
    }
    if (!bottom.peeking || frame() === 0) view.follow(world, frame() === 0);
    else {   // the stylus holds the map: the camera goes there
      view.camX += (bottom.peekX - view.w / 2 - view.camX) * 0.25;
      view.camY += (bottom.peekY - view.h / 2 - view.camY) * 0.25;
      view.camX = Math.max(0, Math.min(world.width - view.w, view.camX));
      view.camY = Math.max(0, Math.min(world.height - view.h, view.camY));
    }
  }
  drawTop(world, view, back, front, eyes);
  time.end();
});

openWindow('Bottom screen', BOTTOM_W, BOTTOM_H, (dt: number) => {
  if (!eyes.first()) { keep(); return; }   // drawn once per pair of eyes
  time.begin();
  bottom.input(world);
  bottom.draw(world, view);
  time.end();
});
