// The top screen: the level as Meadow Run draws it (examples/platformer/src/render.ts), in stereoscopic 3D. Each frame is drawn for one eye
// (zinc:hardware stereoEye); a layer at a depth is shifted by that eye's share of its parallax: the far layer sinks behind the screen, the
// coins and the messages come out of it. Only rectangles, tiles, atlas frames and the pixel font: all of it is replayed on the 3DS's GPU.
import { clear, text, rect, width, height, font, textWidth } from 'zinc:gfx';
import { atlas, Frame } from 'zinc:sprite';
import { Layer } from 'zinc:tilemap';
import { World, Phase } from '../../platformer/src/world';
import { View } from '../../platformer/src/render';
import { Eyes } from '../../n3ds-kit/stereo';
import { SKY, INK, WHITE, GOLD, RED, PIXEL, MIRROR, HURT_TINT, DEPTH_FAR, DEPTH_COINS, DEPTH_TEXT } from './constants';

const art = atlas('game');
const heroIdle = art.animation('hero_idle'), heroRun = art.animation('hero_run'), heroJump = art.animation('hero_jump');
const walker = art.animation('walker'), flyer = art.animation('flyer'), coin = art.animation('coin'), flag = art.animation('flag');
const walkerFlat = art.frame('walker_flat'), pole = art.frame('pole');
const grid = font('grid', 8);

function centered(y: number, s: string, color: u32, size: i32, dx: number): void {
  text(Math.floor((width() - textWidth(grid, s, 0) * size) / 2) + dx, y, s, color, size);
}

/** A frame at a place of the view, when it is on the screen. */
function put(f: Frame, x: number, y: number, flags: i32, view: View): void {
  if (x < -32 || y < -40 || x > view.w || y > view.h) return;
  f.draw(Math.round(x), Math.round(y), 0, 0, 255, PIXEL | flags);
}

export function drawTop(world: World, view: View, back: Layer, front: Layer, eyes: Eyes): void {
  const x = Math.round(view.camX), y = Math.round(view.camY);
  clear(SKY);
  const lv = world.level;
  lv.drawLayer(back, Math.round(x * 0.5) - eyes.shift(DEPTH_FAR), y, view.w, view.h, 255, PIXEL);
  lv.drawLayer(front, x, y, view.w, view.h, 255, PIXEL);
  const ms = world.time * 1000, cs = eyes.shift(DEPTH_COINS);
  for (const c of world.coins) if (!c.taken) put(coin.frameAt(ms), c.x - 3 - x + cs, c.y - 3 - y, 0, view);
  for (const e of world.enemies) {
    if (!e.alive && e.squash <= 0) continue;
    const fx = e.x + e.w / 2 - 12 - x;
    if (e.kind === 'flyer') put(flyer.frameAt(e.t * 1000), fx, e.y + e.h / 2 - 12 - y, 0, view);
    else put(e.alive ? walker.frameAt(e.t * 1000) : walkerFlat, fx, e.y + e.h - 24 - y, e.vx > 0 ? MIRROR : 0, view);
  }
  put(flag.frameAt(ms), world.goalX - x, world.goalY - y, 0, view);
  put(pole, world.goalX - x, world.goalY + 18 - y, 0, view);
  const hero = world.hero;
  const blinking = hero.blink > 0 && hero.hurt <= 0 && Math.floor(hero.blink * 12) % 2 === 1;
  if (!blinking && world.phase !== Phase.Title) {
    const anim = hero.pose === 'run' ? heroRun : hero.pose === 'jump' ? heroJump : heroIdle;
    const f = anim.frameAt(hero.anim), flags = PIXEL | (hero.facing < 0 ? MIRROR : 0);
    f.draw(Math.round(hero.x) - 5 - x, Math.round(hero.y) - 2 - y, 0, 0, 255, flags, 0, hero.pose === 'hurt' ? HURT_TINT : 0xffffff);
  }
  messages(world, eyes.shift(DEPTH_TEXT));
}

/** The title and the end of a game, out of the screen. */
function messages(world: World, dx: number): void {
  const h = height();
  if (world.phase === Phase.Title) {
    rect(0, h / 2 - 44, width(), 72, INK);
    centered(h / 2 - 34, 'MEADOW RUN', GOLD, 4, dx);
    centered(h / 2 + 4, 'in 3D: push the slider up', WHITE, 1, dx);
    if (Math.floor(world.steps / 30) % 2 === 0) centered(h / 2 + 16, 'PRESS START', GOLD, 1, dx);
  } else if (world.phase === Phase.Paused) centered(h / 2 - 8, 'PAUSED', INK, 2, dx);
  else if (world.phase === Phase.Won) {
    rect(0, h / 2 - 30, width(), 52, INK);
    centered(h / 2 - 22, 'GOAL!', GOLD, 3, dx);
    centered(h / 2 + 8, 'PRESS START', WHITE, 1, dx);
  } else if (world.phase === Phase.Over) {
    rect(0, h / 2 - 30, width(), 52, INK);
    centered(h / 2 - 22, 'GAME OVER', RED, 3, dx);
    centered(h / 2 + 8, 'PRESS START', WHITE, 1, dx);
  }
}
