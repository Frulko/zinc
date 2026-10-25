// The top screen, the sky, in stereoscopic 3D: far stars behind the screen, the constellation being filled a little nearer, the falling
// stars and meteors around the screen's depth, and the stars thrown back up coming out of it. Rectangles, two images and the pixel font:
// all of it the GPU's.
import { rect, rrect, text, drawImage, drawImageRect, image, createImage, beginImage, endImage, resetTransform, gradient } from 'zinc:gfx';
import { Eyes } from '../../n3ds-kit/stereo';
import { World, Phase, STAR, SKY_H, R, NAMES } from './world';
import { TOP_W, TOP_H, TOP_X, NIGHT, SIDE, WHITE, DIM, CYAN, GOLD, RED, DEPTH_FAR, DEPTH_SKY, DEPTH_RISING, DEPTH_TITLE } from './constants';

export const starImg = image('kenney/particleSmallStar.png'), meteorImg = image('kenney/ballGrey.png');
const STAR_TINT: u32 = 0xffe066, METEOR_TINT: u32 = 0xff8a5c;

/** A star (a gold disc with Kenney's sparkle over it) or a meteor (the grey ball, red-hot) of size s centred on (x, y). Discs
 *  on whole pixels and of a few sizes: each is rasterized once into the GPU replay's shape atlas. */
export function sprite(meteor: boolean, x: number, y: number, s: i32, alpha: i32): void {
  const cx = Math.round(x), cy = Math.round(y);
  if (meteor) { drawImageRect(meteorImg, 0, 0, 22, 22, cx - s / 2, cy - s / 2, s, s, alpha, 0, 0, METEOR_TINT); return; }
  const c = Math.round(s * 0.55), w = Math.round(s * 0.25);
  rrect(cx - c / 2, cy - c / 2, c, c, c / 2, STAR_TINT, alpha);
  rrect(cx - w / 2, cy - w / 2, w, w, w / 2, 0xffffff, alpha);
  drawImage(starImg, cx - s * 0.8, cy - s * 0.8, s * 1.6, s * 1.6, alpha, 0);
}

/** A vertical gradient painted once into an image (a gradient drawn every frame would be rasterized in software on the 3DS). */
export function backdrop(w: i32, h: i32, top: u32, bottom: u32): i32 {
  const img = createImage(w, h);
  resetTransform();
  beginImage(img);
  gradient(0, 0, w, h, 0, top, bottom, true, 255);
  endImage();
  return img;
}

export class Sky {
  private far: number[] = [];   // x, y, size, colour of the far stars
  private dots: number[][] = []; // per constellation segment i-1 -> i: the dots between them
  private dotsOf = -1;
  private key = ''; private line = '';
  private back = -1;

  constructor() {
    let seed: i32 = 7;
    const rnd = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 2147483648; };
    for (let i: i32 = 0; i < 70; i++) { this.far.push(rnd() * TOP_W); this.far.push(rnd() * TOP_H); this.far.push(rnd() < 0.2 ? 2 : 1); this.far.push(rnd() < 0.5 ? 0x6f7fb8 : 0xb8c4ff); }
  }

  /** The dotted lines of a constellation, worked out once per level. */
  private prepare(world: World): void {
    if (this.dotsOf === world.level) return;
    this.dotsOf = world.level;
    const c = world.constellation();
    this.dots = [[]];
    for (let i: i32 = 2; i < c.length; i += 2) {
      const ax = c[i - 2], ay = c[i - 1], bx = c[i], by = c[i + 1], n = Math.floor(Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) / 7);
      const d: number[] = [];
      for (let k: i32 = 1; k < n; k++) { d.push(Math.round(ax + (bx - ax) * k / n)); d.push(Math.round(ay + (by - ay) * k / n)); }
      this.dots.push(d);
    }
  }

  draw(world: World, eyes: Eyes): void {
    if (this.back < 0) this.back = backdrop(TOP_W, TOP_H, 0x050819, NIGHT);
    drawImage(this.back, 0, 0, TOP_W, TOP_H, 255, 0);
    rect(0, 0, TOP_X, TOP_H, SIDE);
    rect(TOP_W - TOP_X, 0, TOP_X, TOP_H, SIDE);
    const far = eyes.shift(DEPTH_FAR);
    for (let i = 0; i < this.far.length; i += 4) rect(this.far[i] + far, this.far[i + 1], this.far[i + 2], this.far[i + 2], this.far[i + 3]);
    this.prepare(world);
    const sky = eyes.shift(DEPTH_SKY), c = world.constellation(), n = c.length / 2;
    for (let i: i32 = 1; i < n && i < world.lit; i++) {
      const d = this.dots[i];
      for (let k = 0; k < d.length; k += 2) rect(TOP_X + d[k] + sky, d[k + 1], 2, 2, CYAN);
    }
    for (let i: i32 = 0; i < n; i++) {
      const x = TOP_X + c[i * 2] + sky, y = c[i * 2 + 1];
      if (i < world.lit) sprite(false, x, y, 16, 255);
      else {   // a place still empty: a faint ring, the next one blinking
        rrect(x - 5, y - 5, 10, 10, 5, i === world.lit && world.steps % 40 < 20 ? WHITE : DIM, 70);
        rect(x - 1, y - 1, 2, 2, DIM);
      }
    }
    for (const f of world.fallers) {
      if (!f.alive || f.y > SKY_H + R) continue;
      const x = TOP_X + f.x + eyes.shift(f.depth + (f.vy < 0 ? DEPTH_RISING : 0));
      if (f.kind === STAR) {
        if (f.vy < 0) {   // thrown up: a short trail
          sprite(false, x - f.vx * 0.03, f.y - f.vy * 0.03, 12, 120);
          sprite(false, x - f.vx * 0.06, f.y - f.vy * 0.06, 9, 60);
        }
        sprite(false, x, f.y, 2 * R + 4, 255);
      } else sprite(true, x, f.y, 2 * R, 255);
    }
    // the side columns: lives on the left, the level on the right
    for (let i: i32 = 0; i < world.lives; i++) sprite(false, 20, 22 + i * 20, 16, 255);
    const key = `${world.level}`;
    if (key !== this.key) { this.key = key; this.line = `${world.level + 1}`; }
    text(TOP_W - TOP_X + 8, 14, 'LV', DIM, 1);
    text(TOP_W - TOP_X + 8, 26, this.line, GOLD, 2);
    if (world.phase === Phase.Play && !world.demo) text(TOP_X + 6, TOP_H - 14, NAMES[world.level % NAMES.length], DIM, 1);
    else this.title(world, eyes.shift(DEPTH_TITLE));
  }

  private title(world: World, d: number): void {
    text(TOP_X + 64 + d, 70, 'STARFALL', GOLD, 3);
    if (world.phase === Phase.Over) text(TOP_X + 92 + d, 110, 'GAME OVER', RED, 2);
    else text(TOP_X + 44 + d, 112, 'catch the falling stars', WHITE, 1);
    if (world.steps % 60 < 40) text(TOP_X + 60 + d, 150, 'TAP THE TOUCH SCREEN', CYAN, 1);
  }
}
