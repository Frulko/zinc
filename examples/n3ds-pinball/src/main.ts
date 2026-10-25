// Nova Patrol DS: the pinball of examples/pinball made for the Nintendo 3DS's two screens. The table stands across both: its upper half
// (lanes, bumpers, wormhole, targets, spinner, the ramp's top) on the top screen in stereoscopic 3D, its lower half (slingshots, flippers,
// plunger) on the touch screen, and the ball rolls from one to the other. The rules, the table and the physics are the desktop game's,
// unchanged (missions, ranks, multiball, tilt, high scores); this program draws them flat, from above, on the GPU.
//   zinc run --simulate n3ds examples/n3ds-pinball      (the second window is the bottom screen)
// Frame: read the controls -> the rules and the physics on the left eye's frames -> the top screen for this eye; the bottom screen's
// window draws once per pair of eyes and reads the stylus.
import { onFrame, openWindow, keep, pointerDown, pointerX, profMark } from 'zinc:gfx';
import { Game, PH_ATTRACT, PH_PLAY } from '../../pinball/src/game/game';
import { Store } from '../../pinball/src/game/store';
import { Controls } from '../../pinball/src/input';
import { Eyes, ProgramTime } from '../../n3ds-kit/stereo';
import { Half, viewLevel } from './half';
import { Panels } from './panels';
import { Touch, readControls, clearPresses } from './input';
import { TOP_W, TOP_H, BOTTOM_W, BOTTOM_H, BOTTOM_PANEL_W, STEREO_STEPS } from './constants';

// Travel-limited subdivision and Box2D CCD retain fast-contact precision without 960 full adapter calls per second.
export const game = new Game(new Store(true), 1 / 240);
const upper = new Half(game, false, TOP_W, TOP_H);
const lower = new Half(game, true, BOTTOM_W, BOTTOM_H);
const panels = new Panels(game);
const controls = new Controls();
const touch = new Touch();
const eyes = new Eyes();
const time = new ProgramTime('n3ds-pinball');
let pending = 0, wasDown = false;
let ready = false;
const bakeTotal = upper.viewCount() + lower.viewCount();
export function boardReady(): boolean { return ready; }

onFrame((dt: number) => {
  eyes.read();
  eyes.depth = viewLevel(eyes.depth) / STEREO_STEPS;
  if (!ready) {
    if (eyes.first()) {
      if (upper.ready() && lower.ready()) ready = true;
      else if (!upper.ready()) upper.bake();
      else lower.bake();
    }
    if (!ready) {
      panels.loading((upper.baked + lower.baked) / bakeTotal);
      profMark(1);
      return;
    }
  }
  if (eyes.first()) time.refresh();
  time.begin();
  readControls(controls, touch);
  profMark(1);   // input and one-time baking
  pending += dt;
  if (eyes.first()) {   // the world moves on the left eye's frames
    if (controls.pause && game.phase === PH_PLAY) panels.paused = !panels.paused;
    else if (controls.start && panels.paused) panels.paused = false;
    else if (controls.start && game.canAddPlayer()) game.addPlayer();
    else if (controls.start && game.phase === PH_PLAY) panels.paused = true;
    else if (!panels.paused) {
      if (controls.tap && game.phase === PH_ATTRACT) controls.start = true;
      game.update(Math.min(pending, 0.1), controls);
    }
    clearPresses(controls);
    pending = 0;
  }
  profMark(2);   // rules and fixed-step physics
  upper.draw(eyes);
  panels.top(eyes);
  profMark(4);   // top draw commands
  time.end();
});

openWindow('Bottom screen', BOTTOM_W, BOTTOM_H, (dt: number) => {
  if (!eyes.first()) { keep(); return; }   // drawn once per pair of eyes
  if (!ready) { panels.loading((upper.baked + lower.baked) / bakeTotal); return; }
  time.begin();
  // the stylus: the strip right of the table pulls the plunger, the left and right halves hold the flippers
  const down = pointerDown(), x = pointerX();
  touch.tap = down && !wasDown;
  wasDown = down;
  touch.plunger = down && x >= BOTTOM_W - BOTTOM_PANEL_W - 34;   // the shooter lane and the strip beside it
  touch.left = down && !touch.plunger && x < BOTTOM_W / 2;
  touch.right = down && !touch.plunger && x >= BOTTOM_W / 2;
  lower.draw(null);
  panels.bottom(time.fps);
  profMark(4);   // bottom draw commands (native replay follows endWindow)
  time.end();
});
