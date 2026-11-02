import { rect, text, drawImageRect, overlay, capture, quit, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { mkdir, writeBytes, writeText } from 'zinc:fs';
import { encodePng } from './png';
import * as A from './atlas';

// ZINC_HAMLET_VIEW=cite ZINC_HAMLET_ATLAS_DUMP=<dir>: the sprites baked from the generators are written as PNG sheets (<dir>/1x/*.png and 2x/*.png) with <dir>/index.json,
// and a contact sheet <dir>/atlas-preview.png (ZINC_HAMLET_ATLAS_PREVIEW=<file> elsewhere) is drawn with labels and saved, then the program quits.
// ZINC_HAMLET_ATLAS_SCALES=1 makes only the 1x sheets. ZINC_HAMLET_ATLAS_ONLY=person/smith,tree/0 bakes only the groups whose name starts so (the other cells stay empty:
// merge them into the shipped sheets, see ASSETS.md). See ASSETS.md.
interface GroupJson { name: string; generator: string; sheet: string; x: number; y: number; w: number; h: number; anchor: number[]; frames: number; directions: number; chimney?: number[]; pose?: { name: string; frames: number; fps: number; loop: boolean } }
interface SheetJson { name: string; w: number; h: number }
let preview = false, frames = 0, shot = '';

/** The generator entry of a group name: what draws it in the old view's code. */
function generatorOf(name: string): string {
  const p = name.split('/');
  if (p[0] === 'tree') return 'view/models.ts tree(' + p[1] + ') in the ' + p[2] + ' colours, swayed by shear';
  if (p[0] === 'building') return p[1] === 'gate' ? 'view/models.ts gate' : p[1] === 'house-2' ? 'view/models.ts house2' : p[1] === 'house-3' ? 'view/models.ts house3' : p[1] === 'house-4' ? 'view/models.ts house3, lit for the 2 x 2 Manoir' : 'view/models.ts MODEL_DEFS ' + p[1];
  if (p[0] === 'person') return 'view/actors.ts person entry, role ' + p[1] + ', pose ' + p[2];
  if (p[0] === 'carry') return 'view/actors.ts paintProps, carry ' + p[1];
  if (p[0] === 'animal') return 'view/actors.ts deer entry / view/beasts.ts ' + p[1] + ', pose ' + p[2];
  if (p[0] === 'rock') return 'view/models.ts rock(0 to 5): two rocks, then the deposits';
  return 'cite/atlas.ts bakeFx ' + p[1];
}
function indexText(): string {
  const gs = A.groups.map((g: A.Group): GroupJson => {
    const e: GroupJson = { name: g.name, generator: generatorOf(g.name), sheet: A.sheetNames[g.sheet], x: g.x, y: g.y, w: g.cw, h: g.ch, anchor: [g.ax, g.ay], frames: g.cols, directions: g.rows };
    if (g.pose !== '') e.pose = { name: g.pose, frames: g.cols, fps: g.fps, loop: g.loop };
    if (g.name.indexOf('building/') === 0) { const c = A.chimney[A.buildIds.indexOf(g.first)]; e.chimney = [Math.round(c[0]), Math.round(c[1])]; }
    return e;
  });
  const sheets = A.sheetNames.map((n: string, k: number): SheetJson => ({ name: n, w: A.SHEET_W, h: A.sheetH[k] }));
  return JSON.stringify({ version: 2, generator: A.generatorHash(), note: 'Made by the export of src/cite/atlas.ts (ASSETS.md). Sizes and places are in 1x pixels; the 2x sheets hold every cell at twice the size, lit again at twice the scale. A group is a grid of w x h cells with 1 pixel between cells: a row a direction (or a season), a column a frame. anchor: the foot of the sprite in a cell. generator: a hash of the drawing code and its light; when it differs from the build the sheets are stale and the sprites are baked from the generators instead.', sheets, groups: gs }, null, 1);
}

/** Bakes every set, writes the files, and shows the preview for a few frames. */
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
    console.log('atlas dump: ' + k + 'x baked and written in ' + Math.round(performance.now() - t0) + ' ms');
    if (k === 1) A.at.images = s.images;
  }
  writeText(dir + '/index.json', indexText());
  A.at.k = 1;
  preview = true;
  overlay((dt: number): boolean => { drawPreview(); return preview; });
}

/** The contact sheet: the sheets at 1x, then the people and the buildings enlarged six times so a figure can be read. */
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
  // six times larger: a row of people (the lumberjack, the smith, the innkeeper: 8 directions), a house of each level, a pine, a doe
  let ex = 2 * (A.SHEET_W + 12) + 10, ey = 10;
  const big = (id: number, x: number, y: number): void => { drawImageRect(A.at.images[A.sheetOf[id]], A.sx[id], A.sy[id], A.sw[id], A.sh[id], x, y, A.sw[id] * 6, A.sh[id] * 6, 255, 0, 0, 0xffffff, 0); };
  for (const role of [2, 16, 20]) { for (let d = 0; d < 8; d++) big(A.personId(role, A.P_WALK, d, 2), ex + d * 126, ey); ey += 130; }
  for (let k = 0; k < 4; k++) big(A.buildIds[k === 3 ? A.GATE_MODEL + 2 : k === 2 ? A.GATE_MODEL + 1 : k], ex + k * 390, ey);
  ey += 340;
  big(A.treeId(2, 1, 0), ex, ey); big(A.treeId(3, 1, 0), ex + 310, ey); big(A.animalId(0, A.A_WALK, 3, 1), ex + 640, ey); big(A.animalId(4, A.A_WALK, 3, 1), ex + 880, ey);
  frames++;
  if (frames === 6) capture(shot);
  if (frames === 8) { preview = false; quit(); }
}
