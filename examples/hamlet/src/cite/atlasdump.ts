import { rect, text, drawImageRect, overlay, capture, quit, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { mkdir, writeBytes, writeText } from 'zinc:fs';
import { encodePng } from './png';
import * as A from './atlas';

// ZINC_HAMLET_VIEW=cite ZINC_HAMLET_ATLAS_DUMP=<dir>: the sprites made by code are written as PNG sheets (<dir>/1x/*.png and 2x/*.png) with <dir>/index.json,
// and a contact sheet <dir>/atlas-preview.png (ZINC_HAMLET_ATLAS_PREVIEW=<file> elsewhere) is drawn with labels and saved, then the program quits.
// ZINC_HAMLET_ATLAS_SCALES=1 makes only the 1x sheets. See ASSETS.md.
interface GroupJson { name: string; sheet: string; x: number; y: number; w: number; h: number; anchor: number[]; frames: number; directions: number }
interface SheetJson { name: string; w: number; h: number }
let preview = false, frames = 0, shot = '';

function indexText(): string {
  const gs = A.groups.map((g: A.Group): GroupJson => ({ name: g.name, sheet: A.sheetNames[g.sheet], x: g.x, y: g.y, w: g.cw, h: g.ch, anchor: [g.ax, g.ay], frames: g.cols, directions: g.rows }));
  const sheets = A.sheetNames.map((n: string, k: number): SheetJson => ({ name: n, w: A.SHEET_W, h: A.sheetH[k] }));
  return JSON.stringify({ version: 1, note: 'Sizes and places are in 1x pixels; the 2x sheets hold every cell at twice the size. A group is a grid of w x h cells with 1 pixel between them: a row a direction (or a season), a column a frame. anchor: the foot of the sprite in a cell.', sheets: sheets, groups: gs }, null, 1);
}

/** Makes every set by code, writes the files, and shows the preview for a few frames. */
export function dumpRun(): void {
  if (frames > 0 || preview) return;
  const dir = A.dumpDir, scales = env('ZINC_HAMLET_ATLAS_SCALES') === '1' ? [1] : [1, 2];
  shot = env('ZINC_HAMLET_ATLAS_PREVIEW') !== '' ? env('ZINC_HAMLET_ATLAS_PREVIEW') : dir + '/atlas-preview.png';
  mkdir(dir, true);
  for (const k of scales) {
    const t0 = performance.now();
    const s = A.dumpSet(k);
    mkdir(dir + '/' + k + 'x', true);
    for (let n = 0; n < A.sheetNames.length; n++) writeBytes(dir + '/' + k + 'x/' + A.sheetNames[n] + '.png', encodePng(s.px[n], A.SHEET_W * k, A.sheetH[n] * k));
    console.log('atlas dump: ' + k + 'x written in ' + Math.round(performance.now() - t0) + ' ms');
    if (k === 1) A.at.images = s.images;
  }
  writeText(dir + '/index.json', indexText());
  A.at.k = 1;
  preview = true;
  overlay((dt: number): boolean => { drawPreview(); return preview; });
}

function drawPreview(): void {
  rect(0, 0, width(), height(), 0x1c211e);
  const colY = [10, 10];                                           // the two columns; the people sheet takes the second
  const order = [0, 1, 2, 3, 4, 5, 7, 6];
  for (const n of order) {
    const c = n === 6 ? 1 : 0, x = 10 + c * (A.SHEET_W + 12), y = colY[c], h = A.sheetH[n];
    text(x, y, A.sheetNames[n], 0xf0d890, 1);
    rect(x, y + 12, A.SHEET_W, h, 0x30372f);
    drawImageRect(A.at.images[n], 0, 0, A.SHEET_W, h, x, y + 12, A.SHEET_W, h, 255, 0, 0, 0xffffff, 0);
    for (const g of A.groups) if (g.sheet === n && (n === 4 || n === 5 || n === 7)) text(x + g.x, y + 12 + g.y, g.name.substring(g.name.indexOf('/') + 1), 0xffffff, 1);
    colY[c] += h + 24;
  }
  frames++;
  if (frames === 6) capture(shot);
  if (frames === 8) { preview = false; quit(); }
}
