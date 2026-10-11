// Type for the museum table: fonts at any pixel size from a ladder of baked sizes, and word wrapping.
import { font, loadFont, textWidth, lineHeight } from 'zinc:gfx';
import { files } from './files';

// ponytail: the engine bakes only the sizes written as literals in `font('family', px)` calls, and only these families: a text is set in the
// nearest size of this ladder (at most 6 % off above 14 px). These are the families a project has when it names none; the fonts a theme
// names (a family, a font file of the assets) are made at run time, at the very size asked (`setFonts`).
const SIZES: i32[] = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96];
const SANS: i32[] = [font('sans', 7), font('sans', 8), font('sans', 9), font('sans', 10), font('sans', 11), font('sans', 12), font('sans', 13), font('sans', 14), font('sans', 15), font('sans', 16), font('sans', 18),
  font('sans', 20), font('sans', 22), font('sans', 24), font('sans', 26), font('sans', 28), font('sans', 32), font('sans', 36), font('sans', 40), font('sans', 44),
  font('sans', 48), font('sans', 56), font('sans', 64), font('sans', 72), font('sans', 80), font('sans', 96)];
const BOLD: i32[] = [font('sans-bold', 7), font('sans-bold', 8), font('sans-bold', 9), font('sans-bold', 10), font('sans-bold', 11), font('sans-bold', 12), font('sans-bold', 13), font('sans-bold', 14), font('sans-bold', 15),
  font('sans-bold', 16), font('sans-bold', 18), font('sans-bold', 20), font('sans-bold', 22), font('sans-bold', 24), font('sans-bold', 26), font('sans-bold', 28),
  font('sans-bold', 32), font('sans-bold', 36), font('sans-bold', 40), font('sans-bold', 44), font('sans-bold', 48), font('sans-bold', 56), font('sans-bold', 64),
  font('sans-bold', 72), font('sans-bold', 80), font('sans-bold', 96)];

// 'mono', the third family a theme can name, is in the app because of this line.
const MONO: i32 = font('mono', 16);

// The characters the table can show besides ASCII. The engine bakes the glyphs it finds in the sources, and the texts of the table come
// from the project file: this line is how they get their glyphs.
// ponytail: Latin scripts only (Latin-1, Latin Extended-A, common punctuation); another script needs fonts shaped at run time.
export const GLYPHS = '¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ–—‘’‚“”„†‡•…‰‹›€™';

function nearest(px: number): i32 {
  let best: i32 = 0;
  for (let i: i32 = 1; i < SIZES.length; i++) if (Math.abs(SIZES[i] - px) < Math.abs(SIZES[best] - px)) best = i;
  return best;
}
// How the visitor asked to read (the accessibility settings of the dock): the size of every text, as a factor of the designed one, and
// whether faint things are drawn in full. A player sets both around each of its frames and puts them back (`setReading`), so two players
// in one program, and whoever else draws with these fonts (the editor), each read at their own size.
let size = 1, plain = false, cut: i32 = 0;
/** Sets the text size (1: as designed) and the high-contrast mode for what is laid out and drawn from now on. */
export function setReading(factor: number, highContrast: boolean): void { size = factor; plain = highContrast; }
/** The text size being read: what a dimension that holds a text is multiplied by. */
export function reading(): number { return size; }
/** An opacity (0 to 255) for something drawn faintly: a secondary text, a veil under a label. In high contrast it is opaque. */
export function faint(alpha: i32): i32 { return plain ? 255 : alpha; }
/** How many texts `wrap` has cut short with an ellipsis since the last call: what a layout did not have room for. */
export function clipped(): i32 { const n = cut; cut = 0; return n; }

// The fonts of the theme being read, set like the reading by each player around its frames, and the fonts made for them so far.
let textFace = 'sans', titleFace = 'sans-bold';
const made = new Map<string, i32>();
/** Sets the fonts of the texts and of the titles for what is laid out and drawn from now on: a family the engine has ('sans', 'sans-bold',
 *  'mono') or a TrueType file of the project. */
export function setFonts(text: string, title: string): void { textFace = text; titleFace = title; }
/** The font `face` at `px` pixels; `ladder` when it is the family of the ladder, or when there is no such family or file. A file is one of
 *  the project: of the app's assets on the table, of the project's folder in the editor (`files`). */
function face(name: string, px: number, own: string, ladder: i32[]): i32 {
  if (name === own) return ladder[nearest(px)];
  const isFile = name.indexOf('.') > 0, n: i32 = Math.max(6, Math.round(px)), key = `${isFile ? files.path(name) : name} ${n}`;
  let f: i32 = made.get(key) ?? -2;
  if (f === -2) { f = isFile ? (files.exists(name) ? loadFont(files.path(name), n) : -1) : loadFont(name, n); made.set(key, f); }
  return f >= 0 ? f : ladder[nearest(px)];
}
/** The text font nearest to `px` pixels at the designed size. */
export function sans(px: number): i32 { return face(textFace, px * size, 'sans', SANS); }
/** The title font nearest to `px` pixels at the designed size. */
export function bold(px: number): i32 { return face(titleFace, px * size, 'sans-bold', BOLD); }

/** `text` cut into lines no wider than `width` in font `f`: at spaces, and at every `\n`. With `limit` > 0, at most that many lines, the
 *  last one ending with an ellipsis when text is left over. */
export function wrap(f: i32, text: string, width: number, limit: i32): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const w of paragraph.split(' ')) {
      const longer = line.length === 0 ? w : `${line} ${w}`;
      if (line.length > 0 && textWidth(f, longer, 0) > width) { lines.push(line); line = w; }
      else line = longer;
    }
    lines.push(line);
  }
  if (limit <= 0 || lines.length <= limit) return lines;
  cut++;
  const kept = lines.slice(0, limit);
  let last = kept[limit - 1];
  while (last.length > 1 && textWidth(f, last + '…', 0) > width) last = last.slice(0, last.length - 1);
  kept[limit - 1] = last + '…';
  return kept;
}

/** The distance between two baselines of font `f`. */
export function leading(f: i32): number { return Math.round(lineHeight(f) * 1.1); }
