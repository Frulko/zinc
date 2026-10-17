// Drawing: the sky, the far layer at half speed, the level's front layer, the sprites, then the HUD in the 8x8 pixel font
// that every target has. One logical pixel is one screen pixel on the PSP (480x272), the PS2 (640x448) and the 3DS
// (400x240), two on the Vita (960x544) and on the desktop window: the view is the screen divided by that scale, so a
// larger screen sees more of the level, never a different one. Every image is a frame of one atlas ("game"), cut from
// Kenney's Pixel Platformer tilesheets by the asset build.
import { clear, text, rect, width, height, setTransform, resetTransform, font, textWidth, ImageFlag } from 'zinc:gfx';
import { atlas, Animation, Frame } from 'zinc:sprite';
import { Layer } from 'zinc:tilemap';
import { World, Phase, HERO_W, HERO_H } from './world';

const SKY: u32 = 0xdff6f5, INK: u32 = 0x2b2d42, WHITE: u32 = 0xffffff, GOLD: u32 = 0xffcd75, RED: u32 = 0xef7d57, GREEN: u32 = 0x7ff0a5;
const PIXEL = ImageFlag.Nearest as i32, MIRROR = ImageFlag.FlipX as i32;
const HURT_TINT: u32 = 0xff7070;

const art = atlas('game');
const heroIdle = art.animation('hero_idle'), heroRun = art.animation('hero_run'), heroJump = art.animation('hero_jump');
const walker = art.animation('walker'), flyer = art.animation('flyer'), coin = art.animation('coin'), flag = art.animation('flag');
const walkerFlat = art.frame('walker_flat'), pole = art.frame('pole'), heart = art.frame('heart'), heartEmpty = art.frame('heart_empty');
const coinIcon = art.frame('coin_0');

/** What the last frame drew: the budget the consoles care about. */
export class Stats { tiles: i32 = 0; sprites: i32 = 0; }
export const stats = new Stats();

export function pixelScale(): i32 { return height() >= 500 ? 2 : 1; }

export class View {
  camX = 0; camY = 0;
  w = 0; h = 0;
  /** Follows the hero, a little ahead of where it faces, inside the level. */
  follow(world: World, snap: boolean): void {
    const s = pixelScale();
    this.w = width() / s; this.h = height() / s;
    const hero = world.hero;
    const tx = hero.x + HERO_W / 2 + hero.facing * 27 - this.w / 2, ty = hero.y + HERO_H / 2 - this.h * 0.55;
    const k = snap ? 1 : 0.12;
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.camX = Math.max(0, Math.min(world.width - this.w, this.camX));
    this.camY = Math.max(0, Math.min(world.height - this.h, this.camY));
  }
}

/** `text` draws the font "grid" at 8 px times its scale: measured with it, a line is centred whatever the renderer's glyphs. */
function centered(y: number, s: string, color: u32, size: i32): void {
  text(Math.floor((width() - textWidth(font('grid', 8 * size), s, 0)) / 2), y, s, color, size);
}

export function draw(world: World, view: View, back: Layer, front: Layer): void {
  const s = pixelScale();
  const x = Math.round(view.camX), y = Math.round(view.camY);   // whole pixels: tiles meet without seams
  clear(SKY);
  setTransform(s, 0, 0, s, 0, 0);
  const lv = world.level;
  stats.tiles = lv.drawLayer(back, Math.round(x * 0.5), y, view.w, view.h, 255, PIXEL) + lv.drawLayer(front, x, y, view.w, view.h, 255, PIXEL);
  stats.sprites = 0;
  const ms = world.time * 1000;
  for (const c of world.coins) if (!c.taken) put(coin.frameAt(ms), c.x - 3 - x, c.y - 3 - y, 0, view);
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
    stats.sprites++;
  }
  hud(world, s);
}

/** A frame at a place of the view, when it is on the screen. */
function put(f: Frame, x: number, y: number, flags: i32, view: View): void {
  if (x < -32 || y < -40 || x > view.w || y > view.h) return;
  f.draw(Math.round(x), Math.round(y), 0, 0, 255, PIXEL | flags);
  stats.sprites++;
}

// ponytail: the grid font is drawn smaller than textWidth says above ~64 physical px (a Retina window at scale 6), so titles stop at 5
function big(s: i32): i32 { return s === 1 ? 3 : 5; }

let hudKey = '', hudText = '';
function hud(world: World, s: i32): void {
  if (world.phase === Phase.Title) {
    resetTransform();
    rect(0, height() / 2 - 70 * s, width(), 120 * s, INK);
    centered(height() / 2 - 58 * s, 'MEADOW RUN', GOLD, big(s));
    centered(height() / 2 - 22 * s, 'collect the coins, stomp the critters,', WHITE, s);
    centered(height() / 2 - 10 * s, 'reach the flag', WHITE, s);
    centered(height() / 2 + 14 * s, 'D-PAD / ARROWS move  CROSS / SPACE jump', GREEN, s);
    centered(height() / 2 + 26 * s, 'SQUARE / C run   START / ENTER pause', GREEN, s);
    if (Math.floor(world.steps / 30) % 2 === 0) centered(height() / 2 + 38 * s, 'PRESS START', GOLD, s);
    return;
  }
  // still in the view's pixels: three hearts, the coins, then the score and the time in the pixel font
  for (let i = 0; i < 3; i++) { (i < world.lives ? heart : heartEmpty).draw(2 + i * 15, 1, 0, 0, 255, PIXEL); stats.sprites++; }
  coinIcon.draw(48, 1, 0, 0, 255, PIXEL);
  stats.sprites++;
  resetTransform();
  const key = `${world.taken}/${world.score}/${Math.floor(world.time)}`;
  if (key !== hudKey) { hudKey = key; hudText = `${world.taken}   SCORE ${world.score}   TIME ${Math.floor(world.time)}`; }
  text(66 * s, 6 * s, hudText, INK, s);
  if (world.phase === Phase.Paused) centered(height() / 2 - 4 * s, 'PAUSED', INK, 2 * s);
  else if (world.phase === Phase.Won) {
    rect(0, height() / 2 - 36 * s, width(), 72 * s, INK);
    centered(height() / 2 - 24 * s, 'GOAL!', GOLD, big(s));
    centered(height() / 2 + 6 * s, `score ${world.score}   coins ${world.taken}/${world.coins.length}`, WHITE, s);
    centered(height() / 2 + 20 * s, 'PRESS START', WHITE, s);
  } else if (world.phase === Phase.Over) {
    rect(0, height() / 2 - 36 * s, width(), 60 * s, INK);
    centered(height() / 2 - 24 * s, 'GAME OVER', RED, big(s));
    centered(height() / 2 + 8 * s, 'PRESS START', WHITE, s);
  }
}
