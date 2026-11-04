// Quill's map_demo.c, image_anim_demo.cpp and gif_demo.cpp: animation on e-paper, in small partial updates of the Pen waveform.
import { image, imageWidth, imageHeight, drawImage, drawImageRect, imageFromPixels, rect, rrect, stroke, font, drawText, refreshRect, ImageFlag } from 'zinc:gfx';
import { Demo, Steps } from './demo';

// A footprint every half second along a path across the map; each one fades after a few steps. A full refresh now and then clears the ghosts.
const FOOT_SECONDS = 0.45, FEET_SHOWN = 6, FULL_EVERY = 28;
let footSteps = 0, footWait = 0;

// The map in pure black on white, as Quill's map_demo.c draws it: rooms as fractions of the canvas (x, y, w, h), corridors between them.
const ROOMS: number[][] = [[0.1, 0.08, 0.32, 0.2], [0.58, 0.08, 0.32, 0.2], [0.34, 0.38, 0.32, 0.22], [0.1, 0.72, 0.34, 0.2], [0.56, 0.72, 0.34, 0.2]];
const ROOM_NAMES: string[] = ['Bibliothèque', 'Astronomie', 'Cour', 'Grande Salle', 'Cachots'];
const CORRIDORS: number[][] = [[0.42, 0.18, 0.42, 0.42], [0.58, 0.18, 0.58, 0.42], [0.42, 0.6, 0.27, 0.72], [0.58, 0.6, 0.73, 0.72]];

function drawMap(x: i32, y: i32, w: i32, h: i32): void {
  stroke([x + 40, y + 40, x + w - 40, y + 40, x + w - 40, y + h - 40, x + 40, y + h - 40], 6, 0x000000, 255, true);
  for (let i = 0; i < CORRIDORS.length; i++) {
    const c = CORRIDORS[i];
    stroke([x + c[0] * w, y + c[1] * h, x + c[2] * w, y + c[3] * h], 6, 0x000000, 255, false);
  }
  for (let i = 0; i < ROOMS.length; i++) {
    const r = ROOMS[i], rx = x + r[0] * w, ry = y + r[1] * h, rw = r[2] * w, rh = r[3] * h;
    rect(rx, ry, rw, rh, 0xffffff);
    stroke([rx, ry, rx + rw, ry, rx + rw, ry + rh, rx, ry + rh], 5, 0x000000, 255, true);
    drawText(font('sans-bold', 38), rx + 24, ry + 20, ROOM_NAMES[i], 0x000000, 255, 0);
  }
}

function foot(x: number, y: number, side: number): void {
  rrect(x - 8, y - 8, 16, 16, 8, 0x000000, 255);
  rrect(x + side * 8 - 5, y - 18, 10, 10, 5, 0x000000, 255);
  rrect(x + side * 2 - 3, y - 23, 6, 6, 3, 0x000000, 255);
  rrect(x + side * 9 - 3, y - 25, 6, 6, 3, 0x000000, 255);
}

export const map: Demo = {
  title: 'Carte du Maraudeur',
  about: "Une carte fixe, de minuscules pas animés : seuls leurs rectangles changent à l'écran.",
  start: () => { footSteps = 0; footWait = 0; },
  tick: (dt: number) => {
    footWait += dt;
    if (footWait < FOOT_SECONDS) return false;
    footWait = 0; footSteps++;
    if (footSteps % FULL_EVERY === 0) refreshRect(0, 0, 1620, 2160, 'full');
    return true;
  },
  draw: (x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, 0xffffff);
    drawMap(x, y, w, h);
    for (let s = Math.max(0, footSteps - FEET_SHOWN); s <= footSteps; s++) {
      const t = (s % 30) / 30, lane = Math.floor(s / 30) % 3;
      const fx = x + w * (0.1 + 0.8 * t);
      const fy = y + h * (0.33 + lane * 0.15) + Math.sin(t * 6.28) * 50 + (s % 2 === 0 ? -14 : 14);
      foot(fx, fy, s % 2 === 0 ? -1 : 1);
    }
  },
};

// Regions of a dithered picture dissolve and come back: one mask per phase, white where the hash says so, transparent elsewhere.
const PHASES = 12, CELL = 3;
const REGIONS: number[][] = [[0.1, 0.1], [0.58, 0.12], [0.14, 0.56], [0.56, 0.54], [0.38, 0.33]];
const REGION_W = 0.28, REGION_H = 0.3;
const MASK_W = 120, MASK_H = 90;
let masks: i32[] = [];
let hidden: boolean[] = [];
const phases = new Steps(0.09, PHASES);
let fadeCycle = 0, fadePause = 0;

function hash(x: i32, y: i32): i32 {
  let h = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d);
  return (h ^ (h >>> 15)) >>> 0;
}
function buildMasks(): void {
  if (masks.length > 0) return;
  for (let k = 0; k <= PHASES; k++) {
    const px: u8[] = [];
    for (let y = 0; y < MASK_H; y++) for (let x = 0; x < MASK_W; x++) {
      const white = hash(x, y) % PHASES < k;
      px.push(255); px.push(255); px.push(255); px.push(white ? 255 : 0);
    }
    masks.push(imageFromPixels(px, MASK_W, MASK_H));
  }
}

export const fade: Demo = {
  title: 'Fondu par zones',
  about: "Des zones de l'image se dissolvent puis reviennent, point par point, autour d'une image qui reste nette.",
  start: () => { buildMasks(); hidden = [false, false, true, false, false]; phases.reset(); fadeCycle = 0; fadePause = 0; },
  tick: (dt: number) => {
    if (phases.done >= PHASES) {
      fadePause += dt;
      if (fadePause < 0.45) return false;
      fadePause = 0;
      hidden[fadeCycle % REGIONS.length] = true; hidden[(fadeCycle + 2) % REGIONS.length] = false;
      phases.reset(); fadeCycle++;
      if (fadeCycle % 6 === 0) refreshRect(0, 0, 1620, 2160, 'full');
    }
    return phases.due(dt);
  },
  draw: (x: i32, y: i32, w: i32, h: i32) => {
    const img = image('wave-bw.png');
    rect(x, y, w, h, 0xffffff);
    const top = y + (h - imageHeight(img)) / 2;
    drawImage(img, x, top, imageWidth(img), imageHeight(img), 255, 0);
    const a = fadeCycle % REGIONS.length, b = (fadeCycle + 2) % REGIONS.length;
    const rw = imageWidth(img) * REGION_W, rh = imageHeight(img) * REGION_H;
    for (let r = 0; r < REGIONS.length; r++) {
      let k = hidden[r] ? PHASES : 0;
      if (r === a) k = phases.done;
      if (r === b) k = PHASES - phases.done;
      if (k === 0) continue;
      drawImageRect(masks[k], 0, 0, MASK_W, MASK_H, x + imageWidth(img) * REGIONS[r][0], top + imageHeight(img) * REGIONS[r][1],
        rw, rh, 255, ImageFlag.Nearest);
    }
  },
};

// Dithered frames, 12 per second, doubled with sharp pixels; only the box that changed goes to the panel.
const FRAME_W = 480, FRAME_H = 360, FRAME_COUNT = 24, SHEET_COLS = 6;
let frameAt = 0, frameWait = 0;

export const movie: Demo = {
  title: 'Vidéo 12 i/s',
  about: "Une animation tramée en noir et blanc à 12 images par seconde : l'e-ink joue une vidéo sans clignoter.",
  start: () => { frameAt = 0; frameWait = 0; },
  tick: (dt: number) => {
    frameWait += dt;
    if (frameWait < 1 / 12) return false;
    frameWait -= 1 / 12; if (frameWait > 1 / 12) frameWait = 0;
    frameAt = (frameAt + 1) % FRAME_COUNT;
    return true;
  },
  draw: (x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, 0xffffff);
    const dw = FRAME_W * 3, dh = FRAME_H * 3;
    drawImageRect(image('bounce.png'), (frameAt % SHEET_COLS) * FRAME_W, Math.floor(frameAt / SHEET_COLS) * FRAME_H, FRAME_W, FRAME_H,
      x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 255, ImageFlag.Nearest);
  },
};
