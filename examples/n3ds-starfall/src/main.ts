// Starfall: a game made for the Nintendo 3DS's two screens and its stylus. Stars fall from the sky of the top screen (in stereoscopic 3D)
// down through the touch screen; draw a line with the stylus under a star and it is thrown back up, out of the sky and into the
// constellation. Fill the constellation for the next one. Let the meteors through: one that hits a line costs a life, as does a star
// that falls off the bottom.
//   zinc run --simulate n3ds examples/n3ds-starfall      (the second window is the touch screen; the mouse is the stylus)
// Frame: fixed steps of 1/60 s on the left eye's frames -> the sky for this eye; the touch screen's window reads the stylus and draws
// once per pair of eyes. START pauses.
import { onFrame, openWindow, keep, wasPressed, Btn } from 'zinc:gfx';
import { Eyes, ProgramTime } from '../../n3ds-kit/stereo';
import { World, Phase, STEP } from './world';
import { Sky } from './top';
import { Pad } from './bottom';
import { playSounds } from './sound';
import { BOTTOM_W, BOTTOM_H } from './constants';

const world = new World();
const sky = new Sky();
const pad = new Pad();
const eyes = new Eyes();
const time = new ProgramTime('n3ds-starfall');
let pending = 0, paused = false, pausePressed = false, games: i32 = 0;
world.start(1);
world.demo = true;

onFrame((dt: number) => {
  eyes.read();
  if (eyes.first()) time.refresh();
  time.begin();
  pad.prepare();
  pending += dt;
  pausePressed = pausePressed || wasPressed(Btn.Start);
  if (eyes.first()) {
    if (pausePressed && world.phase === Phase.Play && !world.demo) paused = !paused;
    else if (pausePressed || (pad.tapped && (world.phase !== Phase.Play || world.demo))) { games++; world.tap(games * 7919 + 1); paused = false; }
    if (world.demo && world.phase === Phase.Over) world.start(world.steps);   // the demo plays on
    pausePressed = false;
    pad.tapped = false;
    let steps: i32 = 0;
    while (!paused && pending >= STEP * 0.5 && steps < 4) {   // one step per 1/60 s, at most four after a stall
      world.step();
      if (world.demo) world.autopilot(); else playSounds(world.events);
      pending -= STEP; steps++;
    }
    if (paused || pending < 0) pending = 0;
  }
  sky.draw(world, eyes);
  time.end();
});

openWindow('Touch screen', BOTTOM_W, BOTTOM_H, (dt: number) => {
  if (!eyes.first()) { keep(); return; }   // drawn once per pair of eyes
  time.begin();
  pad.input(world);
  pad.draw(world);
  time.end();
});
