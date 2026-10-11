// zinc:sprite (ZN-438): the frames and animations of the sprite atlases that the asset build packs (zinc.json rules `"as": "sprite"`,
// docs/plugins/sprite.md). Every frame of a page is a rectangle of one texture, so the GL renderer draws a scene of them in one batch.
// Where the program runs without its packs (the browser, a board, ZINC_PACKS=""), a frame is the loose image of its name, drawn whole.
import { image, imageWidth, imageHeight, drawImageRect } from 'zinc:gfx';
import { exists, readText, onReload } from 'zinc:assets';

/** A frame: a rectangle of an atlas page, in the page's texels, and where it lies in the image it was cut from, in points. */
export class Frame {
  name: string;
  /** The page: a zinc:gfx image. */
  image: i32;
  x: number; y: number; w: number; h: number;
  /** Where the rectangle starts in its source image (the transparent border the build trimmed away), and the source's size: points. */
  ox: number; oy: number; width: number; height: number;
  /** Texels per point (2 for an SVG or an @2x image). */
  scale: number;
  /** The point rotations turn around, 0..1 of the source image. */
  pivotX: number; pivotY: number;
  /** Its time in an animation, ms. */
  duration: number;

  constructor(name: string, image: i32, x: number, y: number, w: number, h: number, ox: number, oy: number, width: number, height: number,
              scale: number, pivotX: number, pivotY: number, duration: number) {
    this.name = name; this.image = image; this.x = x; this.y = y; this.w = w; this.h = h; this.ox = ox; this.oy = oy;
    this.width = width; this.height = height; this.scale = scale; this.pivotX = pivotX; this.pivotY = pivotY; this.duration = duration;
  }

  /** Takes the place and timing of `f` (the same frame in a rebuilt atlas). */
  copy(f: Frame): void {
    this.image = f.image; this.x = f.x; this.y = f.y; this.w = f.w; this.h = f.h; this.ox = f.ox; this.oy = f.oy;
    this.width = f.width; this.height = f.height; this.scale = f.scale; this.pivotX = f.pivotX; this.pivotY = f.pivotY; this.duration = f.duration;
  }

  /** Draws the frame where its whole source image would be drawn on (x, y, w, h); w, h <= 0: its own size. alpha 0..255; flags: ImageFlag
   *  bits (mirrored, nearest); rotation: radians, clockwise around the pivot; tint 0xRRGGBB; blend: a Blend mode. */
  draw(x: number, y: number, w: number = 0, h: number = 0, alpha: i32 = 255, flags: i32 = 0, rotation: number = 0, tint: u32 = 0xffffff, blend: i32 = 0): void {
    if (w <= 0) w = this.width;
    if (h <= 0) h = this.height;
    const kx = w / this.width, ky = h / this.height, tw = this.w / this.scale, th = this.h / this.scale;
    const fx = (flags & 1) !== 0, fy = (flags & 2) !== 0;
    let dx = x + (fx ? this.width - this.ox - tw : this.ox) * kx, dy = y + (fy ? this.height - this.oy - th : this.oy) * ky;
    const dw = tw * kx, dh = th * ky;
    if (rotation !== 0) {   // drawImageRect turns around the centre of what it draws: put that centre where the turn around the pivot takes it
      const px = x + (fx ? 1 - this.pivotX : this.pivotX) * w, py = y + (fy ? 1 - this.pivotY : this.pivotY) * h;
      const cx = dx + dw / 2 - px, cy = dy + dh / 2 - py, c = Math.cos(rotation), s = Math.sin(rotation);
      dx = px + cx * c - cy * s - dw / 2;
      dy = py + cx * s + cy * c - dh / 2;
    }
    drawImageRect(this.image, this.x, this.y, this.w, this.h, dx, dy, dw, dh, alpha, flags, rotation, tint, blend);
  }
}

/** Frames shown one after the other: an Aseprite tag, a sheet's animation, or numbered files (walk_1.png, walk_2.png: "walk"). */
export class Animation {
  name: string;
  /** 'forward', 'reverse' or 'pingpong' (there and back, the ends once). */
  mode: string;
  frames: Frame[] = [];
  private seq: i32[] = [];   // the frames of one pass, in order

  constructor(name: string, mode: string, frames: Frame[]) {
    this.name = name; this.mode = mode;
    this.set(mode, frames);
  }

  /** Its frames and mode (again, when the atlas is rebuilt). */
  set(mode: string, frames: Frame[]): void {
    this.mode = mode; this.frames = frames; this.seq = [];
    const n = frames.length;
    if (mode === 'reverse') { for (let i = n - 1; i >= 0; i--) this.seq.push(i); }
    else {
      for (let i = 0; i < n; i++) this.seq.push(i);
      if (mode === 'pingpong') for (let i = n - 2; i > 0; i--) this.seq.push(i);
    }
  }

  /** One pass, ms. */
  duration(): number {
    let t = 0;
    for (const i of this.seq) t += this.frames[i].duration;
    return t;
  }

  /** The frame shown `ms` after the start: passes repeat when `loop`, else the last frame of the pass stays. */
  frameAt(ms: number, loop: boolean = true): Frame {
    const total = this.duration();
    let t = ms < 0 ? 0 : ms;
    if (total <= 0) return this.frames[this.seq[0]];
    if (loop) t = t % total;
    else if (t >= total) return this.frames[this.seq[this.seq.length - 1]];
    for (const i of this.seq) {
      if (t < this.frames[i].duration) return this.frames[i];
      t -= this.frames[i].duration;
    }
    return this.frames[this.seq[this.seq.length - 1]];
  }
}

/** An atlas: its pages (zinc:gfx images), its frames by name (sorted) and its animations. */
export class Atlas {
  name: string;
  pages: i32[] = [];
  frames: Frame[] = [];
  animations: Animation[] = [];
  private byName: Map<string, i32> = new Map<string, i32>();
  private animByName: Map<string, i32> = new Map<string, i32>();

  constructor(name: string) { this.name = name; }

  add(f: Frame): void { this.byName.set(f.name, this.frames.length); this.frames.push(f); }
  addAnimation(a: Animation): void { this.animByName.set(a.name, this.animations.length); this.animations.push(a); }

  /** Whether the atlas has the frame, or (without packs) an image of that name. */
  has(name: string): boolean { return this.byName.has(name) || (this.pages.length === 0 && image(name) >= 0); }

  /** The frame of that name: the path of its file in the assets (an @2x file without the @2x), `file.aseprite#3`, or a sheet's own name. */
  frame(name: string): Frame {
    const i = this.byName.get(name) ?? -1;
    if (i >= 0) return this.frames[i];
    const im = this.pages.length === 0 ? image(name) : -1;   // no packs: the loose image, drawn whole
    if (im < 0) throw new Error(`zinc:sprite: the atlas ${this.name} has no frame ${name}`);
    const w = imageWidth(im), h = imageHeight(im), f = new Frame(name, im, 0, 0, w, h, 0, 0, w, h, 1, 0.5, 0.5, 100);
    this.add(f);
    return f;
  }

  /** The animation of that name: `file.aseprite` (all its frames), `file.aseprite#tag`, a sheet's tag, or the stem of numbered files. */
  animation(name: string): Animation {
    const i = this.animByName.get(name) ?? -1;
    if (i < 0) throw new Error(`zinc:sprite: the atlas ${this.name} has no animation ${name}`);
    return this.animations[i];
  }

  /** Reads its table: the frames and animations already handed out take their new places (zinc dev rebuilt the atlas), new ones are added. */
  read(table: string): void {
    const lines = readText(table).split('\n');
    if (lines[0] !== 'zinc-atlas\t1') throw new Error(`zinc:sprite: ${table} is not an atlas table this module reads`);
    const pages: i32[] = [], rows: Frame[] = [];   // rows: the frames in table order, as the anim rows number them
    for (let k = 1; k < lines.length; k++) {
      const c = lines[k].split('\t');
      if (c[0] === 'page') pages.push(image(c[1]));
      else if (c[0] === 'frame') {
        const s = parseFloat(c[11]);
        const f = new Frame(c[1], pages[parseInt(c[2])], parseFloat(c[3]), parseFloat(c[4]), parseFloat(c[5]), parseFloat(c[6]),
                            parseFloat(c[7]) / s, parseFloat(c[8]) / s, parseFloat(c[9]) / s, parseFloat(c[10]) / s, s,
                            parseFloat(c[12]), parseFloat(c[13]), parseFloat(c[14]));
        const i = this.byName.get(f.name) ?? -1;
        if (i >= 0) { this.frames[i].copy(f); rows.push(this.frames[i]); }
        else { this.add(f); rows.push(f); }
      } else if (c[0] === 'anim') {
        const fs: Frame[] = [];
        for (let i = 3; i < c.length; i++) fs.push(rows[parseInt(c[i])]);
        const j = this.animByName.get(c[1]) ?? -1;
        if (j >= 0) this.animations[j].set(c[2], fs);
        else this.addAnimation(new Animation(c[1], c[2], fs));
      }
    }
    this.pages = pages;
  }
}

/** The atlas the asset build made of the rules `"atlas": name` (the default atlas is "sprites"): its table <name>.atlas and its pages. */
/** Under zinc dev, a change of one of its images rebuilds the atlas and the frames handed out follow it, while the program runs. */
export function atlas(name: string = 'sprites'): Atlas {
  const a = new Atlas(name);
  const table = name + '.atlas';
  if (!exists(table)) return a;
  a.read(table);
  onReload(table, (t: string) => { a.read(t); });
  return a;
}
