// Deterministic views isolate cached ramp/background disparity from moving balls and effects.
import { onFrame } from 'zinc:gfx';
import { Half, viewLevel } from '../src/half';
import { topDown } from '../src/art';
import { STEREO_STEPS, DEPTH_PER_INCH, SPLIT } from '../src/constants';
import { starDepth } from '../../pinball/src/render/art';
import { Game } from '../../pinball/src/game/game';
import { Store } from '../../pinball/src/game/store';
import { Eyes } from '../../n3ds-kit/stereo';

function check(ok: boolean, text: string): void { if (!ok) throw new Error(text); }
check(viewLevel(-1) === 0 && viewLevel(2) === STEREO_STEPS, 'slider clamps to cached range');
const cam = topDown(SPLIT / 2, 200, 120, 1);
cam.parallax = DEPTH_PER_INCH / 2;
cam.project(13.7, 9, 0); const ground = cam.x;
cam.project(13.7, 9, 2.8); const leftHigh = cam.x;
cam.parallax = -DEPTH_PER_INCH / 2;
cam.project(13.7, 9, 2.8); const rightHigh = cam.x;
check(Math.abs(leftHigh - rightHigh - 2.8 * DEPTH_PER_INCH) < 0.0001, 'ramp summit disparity follows height');
cam.project(13.7, 9, 0);
check(Math.abs(cam.x - ground) < 0.0001, 'playfield remains at screen depth');
check(starDepth(1) < starDepth(0) && starDepth(0) < 0, 'two star planes behind playfield');
check(cam.scaledInto(2, 0, 0).parallax === cam.parallax * 2, 'stereo survives scaled image camera');

const game = new Game(new Store(false));
const upper = new Half(game, false, 400, 240), eyes = new Eyes();
let frame = 0;
onFrame(() => {
  frame++;
  if (!upper.ready()) { upper.bake(); return; }
  const baked = upper.baked;
  eyes.eye = frame === 11 || frame === 13 ? 1 : 0;
  eyes.depth = frame === 12 || frame === 13 ? 0 : 1;
  upper.draw(eyes);
  check(upper.baked === baked && baked === STEREO_STEPS * 2 + 1, 'slider switches do not rebake');
  if (frame === 14) console.log('pinball stereo: stars, ramp slope, mono and cached slider passed');
});
