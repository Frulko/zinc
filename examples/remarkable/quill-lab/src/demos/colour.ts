// Quill's image_demo.cpp, color_image_demo.cpp and the colour probes: what the Gallery 3 panel does with colour.
// Under the ink session each step names its raw waveform (setWaveform); on qtfb the same pictures appear in the UI waveform.
import { image, imageWidth, imageHeight, drawImage, rect, rrect, gradient, font, drawText } from 'zinc:gfx';
import { setWaveform } from 'zinc:remarkable';
import { Demo, Steps } from './demo';

const CONTENT_COLOUR = true;
const label = (x: number, y: number, s: string): void => { drawText(font('sans-bold', 34), x, y, s, 0x000000, 255, 0); };

function still(title: string, about: string, name: string): Demo {
  return {
    title, about,
    start: () => { setWaveform(4, CONTENT_COLOUR); },
    tick: (_dt: number) => false,
    draw: (x: i32, y: i32, w: i32, h: i32) => {
      const img = image(name);
      rect(x, y, w, h, 0xffffff);
      const k = Math.min(1, w / imageWidth(img)), dw = imageWidth(img) * k, dh = imageHeight(img) * k;
      drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 255, 0);
    },
  };
}
export const blackWhite = still('Image N&B', 'Une photo tramée en noir et blanc pur, au pixel près : le rendu le plus net de la dalle.', 'wave-bw.png');
export const colourImage = still('Image couleur', 'La même estampe en couleur, sur le chemin couleur de la dalle (mode 4).', 'great-wave.jpg');

const BARS: u32[] = [0xff0000, 0x00ff00, 0x0000ff, 0x00ffff, 0xff00ff, 0xffff00, 0xffffff, 0x000000];
export const bars: Demo = {
  title: 'Couleurs',
  about: 'Rouge, vert, bleu, cyan, magenta, jaune et dégradés : la palette réelle de la dalle.',
  start: () => { setWaveform(4, CONTENT_COLOUR); },
  tick: (_dt: number) => false,
  draw: (x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, 0xffffff);
    const barW = w / BARS.length, barH = h * 0.6;
    for (let i = 0; i < BARS.length; i++) rect(x + i * barW, y, barW + 1, barH, BARS[i]);
    const row = (h - barH) / 3;
    gradient(x, y + barH, w, row, 0, 0x000000, 0xffffff, false, 255);
    gradient(x, y + barH + row, w, row, 0, 0xff0000, 0x0000ff, false, 255);
    gradient(x, y + barH + row * 2, w, row, 0, 0xffff00, 0x00ffff, false, 255);
  },
};

// The same pattern four times, each column first shown in its own mode. Mode 1 collapses to greys: that is the finding of Quill's probe.
const MODES: i32[] = [1, 3, 4, 5];
const modeSteps = new Steps(1.2, MODES.length);
export const modes: Demo = {
  title: 'Modes comparés',
  about: 'Le même motif rafraîchi dans quatre modes, côte à côte. Le mode 1 tombe en gris ; 3, 4 et 5 gardent la couleur.',
  start: () => { modeSteps.reset(); },
  tick: (dt: number) => {
    if (!modeSteps.due(dt)) return false;
    setWaveform(MODES[modeSteps.done - 1], CONTENT_COLOUR);
    return true;
  },
  draw: (x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, 0xffffff);
    const colW = w / MODES.length;
    for (let m = 0; m < modeSteps.done; m++) {
      const cx = x + m * colW + 8, cw = colW - 16;
      label(cx + 10, y + 16, `mode ${MODES[m]}`);
      for (let i = 0; i < 6; i++) rect(cx, y + 76 + i * 200, cw, 196, BARS[i]);
      gradient(cx, y + 76 + 1200, cw, 200, 0, 0x000000, 0xffffff, true, 255);
      gradient(cx, y + 76 + 1400, cw, 200, 0, 0xff0000, 0x00ff00, true, 255);
    }
  },
};

// Coloured cells appear one at a time on a pastel page, then some are erased: only their rectangle updates.
const COLS = 6, ROWS = 8, PATCHES = 18;
const patchSteps = new Steps(0.45, PATCHES + 8);
const PASTEL: u32 = 0xf4efe0;
export const patches: Demo = {
  title: 'Patchs partiels',
  about: 'Des cases de couleur apparaissent une à une puis s’effacent : seul leur rectangle change.',
  start: () => { patchSteps.reset(); setWaveform(4, CONTENT_COLOUR); },
  tick: (dt: number) => patchSteps.due(dt),
  draw: (x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, PASTEL);
    const cw = w / COLS, ch = h / ROWS;
    for (let c = 1; c < COLS; c++) rect(x + c * cw, y, 2, h, 0xc8c0a8);
    for (let r = 1; r < ROWS; r++) rect(x, y + r * ch, w, 2, 0xc8c0a8);
    for (let i = 0; i < Math.min(patchSteps.done, PATCHES); i++) {
      if (i < patchSteps.done - PATCHES) continue;   // erased again, oldest first
      const at = (i * 7) % (COLS * ROWS), col = at % COLS, row = Math.floor(at / COLS);
      rrect(x + col * cw + 16, y + row * ch + 16, cw - 32, ch - 32, 16, BARS[i % 6], 255);
    }
  },
};

// No hardware alpha on this panel: translucency is blended by the app, then written as opaque pixels.
const LAYERS: u32[] = [0xff0000, 0x00c000, 0x0000ff];
const blendSteps = new Steps(0.8, 1 + LAYERS.length + 6);
export const blends: Demo = {
  title: 'Transparence',
  about: 'En haut, trois voiles fondus en une passe. En bas, les mêmes empilés un par un : des surlignages colorés sont possibles.',
  start: () => { blendSteps.reset(); setWaveform(4, CONTENT_COLOUR); },
  tick: (dt: number) => blendSteps.due(dt),
  draw: (x: i32, y: i32, w: i32, h: i32) => {
    rect(x, y, w, h, 0xffffff);
    const grid = (top: number, height: number): void => {
      for (let c = 0; c < 10; c++) rect(x + 60 + c * 150, top, 3, height, 0x808080);
      for (let r = 0; r < 5; r++) rect(x + 60, top + r * (height / 4), 1350, 3, 0x808080);
    };
    const veils = (top: number, shown: i32): void => {
      for (let i = 0; i < shown; i++) rrect(x + 120 + i * 300, top + 40 + i * 60, 760, 480, 24, LAYERS[i], 110);
    };
    const panel = h * 0.36;
    grid(y + 30, panel); veils(y + 30, LAYERS.length);
    grid(y + 60 + panel, panel); veils(y + 60 + panel, Math.min(blendSteps.done - 1, LAYERS.length));
    // the same rectangle highlighted again and again: each pass darkens it
    const passes = Math.max(0, blendSteps.done - 1 - LAYERS.length);
    const top = y + 90 + panel * 2;
    for (let i = 0; i < passes; i++) rrect(x + 60 + i * 80, top, 1500 - i * 160, h - panel * 2 - 120, 16, 0xffd000, 70);
  },
};
