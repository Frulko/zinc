import {
  W, H, pix, zb, bakedPix, bakedZ, pendingShadows, rgb, hash, project,
  plot, figure, dynamicAdd, flushShadows, applyShadows, drawLeaves,
  drawTufts, shadeEdges, ctx, image,
} from '../renderer.js';
import { drawBoat } from './scenery.js';
import { ROPE, BRICK, COURIER, SAILOR } from './palette.js';
import { game, boatPosition } from './state.js';
import { drawFish, drawLandAnimals } from './animals.js';
import { drawWater } from './water.js';
import { drawCargo, drawCargoTarget, drawFlight, drawAim, drawSplash } from './effects.js';

function drawFlag(boat, time) {
  for (let z = 1.9; z < 3.25; z += .08) plot(boat.x - 1.85, boat.y, boat.z + z, rgb(...ROPE));
  const gust = Math.round(Math.sin(time * 2.6) * 1.5) / 10;
  for (let x = 0; x < .95; x += .05) {
    for (let z = 0; z < .52 * (1 - x / .95); z += .05) {
      plot(boat.x - 1.85 + x, boat.y + gust * x, boat.z + 3.2 - z, rgb(...BRICK));
    }
  }
}

function drawSmoke(time) {
  for (let k = 0; k < 5; k++) {
    const age = (time * .16 + k * .2) % 1;
    const color = rgb(198 + age * 35, 195 + age * 37, 185 + age * 45);
    const point = project(-6.8 + age * .9, -4.9 + age * .25, 5.4 + age * 1.8);
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        if (hash(x + k, y + Math.floor(time * 2)) < .35 + age * .5) continue;
        const ix = Math.round(point.sx) + x, iy = Math.round(point.sy) + y;
        if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
          const index = iy * W + ix;
          if (point.d > zb[index]) pix[index] = color;
        }
      }
    }
  }
}

export function drawHarbor() {
  const time = Math.floor(game.time * 8) / 8;
  const boat = boatPosition(game.elapsed, time);
  if (game.phase === 'over') boat.y += Math.min(6, (game.time - game.endedAt) * .7);
  pix.set(bakedPix);
  zb.set(bakedZ);
  pendingShadows.length = 0;
  drawLeaves(time);
  drawTufts(time);
  drawWater(time, boat);
  drawBoat(boat);
  drawCargoTarget(boat);
  drawCargo(boat);
  drawFlag(boat, time);
  const elapsed = game.time - game.lastThrowAt;
  const throwPose = elapsed < .6 ? Math.sin(Math.min(1, elapsed / .6) * Math.PI) : 0;
  const windingUp = game.aiming ? .45 : 0;
  figure(-.45, .1, 0, {
    z: 1, scale: .9, lean: .07 + throwPose * .3,
    armR: .25 + throwPose * 1.9 - windingUp, armL: .4, stance: .12,
  }, COURIER, dynamicAdd);
  const waving = game.outcome && game.outcome.kind === 'delivered' && game.time - game.outcome.at < 1.4;
  figure(boat.x + 2.6, boat.y, Math.PI, {
    z: boat.z + .52, scale: .8, stance: .08,
    armR: waving ? 2.4 + Math.floor(time * 4) % 2 * .3 : .3, armL: .4,
  }, SAILOR, dynamicAdd);
  drawFlight();
  drawFish(time);
  drawLandAnimals(time);
  flushShadows();
  applyShadows(bakedZ);
  shadeEdges();
  drawSplash();
  drawSmoke(time);
  drawAim();
  ctx.putImageData(image, 0, 0);
}
