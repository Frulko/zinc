// The tables the game can play, and their list on the table that waits for a player: a card per table, with a picture and its
// name, the chosen one marked. Tab (or T, or Select on a pad) goes to the next table, a press on a card takes that one; the table
// behind the list is then the chosen one, and Start plays it. The tables are those of the game's own assets (a folder
// tables/<name>/ with its table.json, or a package tables/<name>.zpinball: a table put there is in the list at the next start)
// and the one --table names. With one table there is nothing to choose, and no list.
import { rect, rrect, border, font, drawText, textWidth, imageWidth, imageHeight, drawImageRect, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { nextTable } from './input';
import * as assets from 'zinc:assets';
import { TABLE_FILE } from './format/table';
import { TableSource, BuiltinSource, packageOfBytes, PACKAGE_EXT, openTable } from './format/source';
import { tableImage } from './images';
import { View } from './view';

/** A table of the list. */
export class Choice {
  name: string;
  source: TableSource;
  /** The image of its folder that stands for it ('' for none). */
  picture: string;
  constructor(name: string, source: TableSource, picture: string) { this.name = name; this.source = source; this.picture = picture; }
}

/** The value at a path of keys of a parsed file ("layouts.landscape.panel.image"); undefined when a step of the way is missing. */
function inside(o: any, path: string): any {
  let v: any = o;
  for (const key of path.split('.')) {
    if (v === undefined || v === null || typeof v !== 'object') return undefined;
    v = v[key];
  }
  return v;
}
/** What a table says of itself for the list: its name, and its picture (the backglass of its landscape layout, else of its
 *  portrait one, else the painting of its playfield). The file is read, not checked: a table with a fault is in the list, and the
 *  fault is told when it is chosen. null when the source holds no table file with a name. */
function choiceOf(source: TableSource): Choice | null {
  let t: any = null;
  try { if (source.has(TABLE_FILE)) t = JSON.parse(source.text(TABLE_FILE)); } catch (e) { return null; }
  const name = textOf(inside(t, 'name'));
  if (name === '') return null;
  let picture = textOf(inside(t, 'layouts.landscape.panel.image'));
  if (picture === '') picture = textOf(inside(t, 'layouts.portrait.panel.image'));
  if (picture === '') {
    const look = textOf(inside(t, 'playfield.look')), looks: any = inside(t, 'looks');
    if (Array.isArray(looks)) for (let i = 0; i < looks.length; i++) if (textOf(inside(looks[i], 'id')) === look) picture = textOf(inside(looks[i], 'texture'));
  }
  return new Choice(name, source, picture);
}
function textOf(v: any): string { return typeof v === 'string' ? `${v}` : ''; }
/** The tables of the game's assets, then the one `named` (a folder, a table.json or a package; '' for none): it takes the place
 *  of the table of the same name when the list has one. */
export function tablesOf(named: string): Choice[] {
  const out: Choice[] = [];
  for (const name of assets.list()) {
    if (!name.startsWith('tables/')) continue;
    let c: Choice | null = null;
    if (name.endsWith(`/${TABLE_FILE}`) && name.indexOf('/', 7) === name.length - TABLE_FILE.length - 1) c = choiceOf(new BuiltinSource(name.slice(7, name.length - TABLE_FILE.length - 1)));
    else if (name.endsWith(PACKAGE_EXT) && name.indexOf('/', 7) < 0) { try { c = choiceOf(packageOfBytes(assets.readBytes(name), name)); } catch (e) { c = null; } }
    if (c !== null) out.push(c);
  }
  if (named !== '') {
    const c = choiceOf(openTable(named));   // (a package that cannot be read throws: the player named it, the fault is the player's to read)
    if (c === null) throw new Error(`${named}: there is no table there (${TABLE_FILE})`);
    let at = -1;
    for (let i = 0; i < out.length; i++) if (out[i].name === c.name) at = i;
    if (at < 0) out.push(c); else out[at] = c;
  }
  return out;
}
/** The place of the table called `name` in a list; 0 when none is. */
export function placeOf(list: Choice[], name: string): i32 {
  for (let i = 0; i < list.length; i++) if (list[i].name === name) return i;
  return 0;
}

// ---------------------------------------------------------------- the list on screen

// the cards, in the pixels of the layout's own window (a window of another size scales them with the rest)
const CARD = 150, PICTURE = 100, GAP = 14, LABEL = 30;
// the sizes of text asked here are the ones baked into the program
let SMALL: i32[] = [], SIZES: i32[] = [];
function fonts(): void { if (SMALL.length === 0) { SIZES = [10, 12, 14, 16, 20]; SMALL = [font('sans-bold', 10), font('sans-bold', 12), font('sans-bold', 14), font('sans-bold', 16), font('sans-bold', 20)]; } }
function nearest(px: number): i32 {
  let best = 0;
  for (let i = 1; i < SIZES.length; i++) if (Math.abs(SIZES[i] - px) < Math.abs(SIZES[best] - px)) best = i;
  return best;
}
/** Where card `i` of `n` is, in window pixels: [x, y, width, height]. The row is centred in the box of the table's view, under
 *  its middle and above the corner where a press pulls the plunger; the cards narrow when there are many. */
function cardBox(v: View, i: i32, n: i32): number[] {
  const b = v.layout.view, w = Math.min(CARD, (b[2] - 2 * GAP - (n - 1) * GAP) / n), h = w * PICTURE / CARD + LABEL;
  const x = b[0] + (b[2] - n * w - (n - 1) * GAP) / 2 + i * (w + GAP), y = b[1] + b[3] * 0.5;
  return [v.x([x, y, w, h]), v.y([x, y, w, h]), v.w([x, y, w, h]), v.h([x, y, w, h])];
}
/** Draws the list over the table: `at` is the chosen one. */
export function drawChooser(v: View, list: Choice[], at: i32): void {
  const n: i32 = list.length;
  if (n < 2) return;
  fonts();
  const first = cardBox(v, 0, n), last = cardBox(v, n - 1, n), pad = Math.round(10 * v.scale), k = nearest(13 * v.scale), f = SMALL[k];
  const hint = 'TAB: NEXT TABLE', hw = textWidth(f, hint, 1), cx = (first[0] + last[0] + last[2]) / 2;
  rrect(first[0] - pad, first[1] - pad, last[0] + last[2] - first[0] + 2 * pad, first[3] + 3 * pad + SIZES[k], Math.round(8 * v.scale), 0x05060c, 190);
  for (let i = 0; i < n; i++) {
    const b = cardBox(v, i, n), on = i === at, ph = Math.round(b[3] * PICTURE / (PICTURE + LABEL));
    rect(b[0], b[1], b[2], b[3], on ? 0x1c2233 : 0x10131d);
    // the picture fills its place, keeping its proportions: what does not fit is cut, centred
    const im = tableImage(list[i].source, list[i].picture);
    if (im >= 0) {
      const iw = imageWidth(im), ih = imageHeight(im), s = Math.max(b[2] / iw, ph / ih), sw = b[2] / s, sh = ph / s;
      drawImageRect(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, b[0], b[1], b[2], ph, on ? 255 : 120);
    }
    const name = list[i].name;
    let size = k;
    while (size > 0 && textWidth(SMALL[size], name, 0) > b[2] - 8) size--;
    drawText(SMALL[size], Math.round(b[0] + (b[2] - textWidth(SMALL[size], name, 0)) / 2), Math.round(b[1] + ph + (b[3] - ph - SIZES[size] * 1.25) / 2), name, on ? 0xffffff : 0x8090b0, 255, 0);
    if (on) border(b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4, 3, 2, 0xffcc33, 255);
  }
  drawText(f, Math.round(cx - hw / 2), first[1] + first[3] + pad, hint, 0x8090b0, 255, 1);
}

let pressHeld = false;
/** What the player asks of the list this frame: the place of the table to go to (the next one, or the one of the card
 *  pressed), or -1 for nothing. */
export function chosenNow(v: View, list: Choice[], at: i32): i32 {
  const n: i32 = list.length;
  const press = pointerDown(), go = nextTable, tap = press && !pressHeld;   // the next table: an action of the controls (input.ts)
  pressHeld = press;
  if (n < 2) return -1;
  if (tap) for (let i = 0; i < n; i++) {
    const b = cardBox(v, i, n), x = pointerX(), y = pointerY();
    if (x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]) return i === at ? -1 : i;
  }
  return go ? (at + 1) % n : -1;
}
