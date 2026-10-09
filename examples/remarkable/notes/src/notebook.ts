// The notebook: one Ink surface showing the current page, the strokes of every page, the current tool, and
// loading / saving pages as JSON (plus an SVG export) in the notes directory.
import { createSignal } from 'zinc:ui/solid';
import { Ink, Stroke, parseStrokes } from 'zinc:ink';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import refresh from '../native/refresh.spec';

const DIR = sys.platform() === 'rmpp' ? '/home/root/zinc-notes' : 'notes-data';
export const COLORS: i32[] = [0x000000, 0x6b7280, 0x1d4ed8, 0xdc2626, 0x15803d, 0xca8a04];
export const COLOR_NAMES: string[] = ['Black', 'Grey', 'Blue', 'Red', 'Green', 'Gold'];
export const WIDTHS: number[] = [3, 6, 12];
export const WIDTH_NAMES: string[] = ['Fine', 'Medium', 'Bold'];

export const ink = new Ink();
ink.width = 6;
const pages: Stroke[][] = [[]];

export const [page, setPage] = createSignal<i32>(0);
export const [pageCount, setPageCount] = createSignal<i32>(1);
export const [tool, setTool] = createSignal<string>('pen');
export const [color, setColor] = createSignal<i32>(0x000000);
export const [penWidth, setPenWidth] = createSignal<number>(6);
export const [status, setStatus] = createSignal<string>('');

export const [fastDrawing, setFastDrawing] = createSignal<boolean>(true);
export const [displayBusy, setDisplayBusy] = createSignal<boolean>(false);
export const onTablet: boolean = sys.platform() === 'rmpp';

/** Switch only on an explicit button press; per-stroke switches stall AppLoad. */
export function pickDisplay(fast: boolean): void {
  if (refresh.busy()) return;
  if (!refresh.setFast(fast)) { setStatus('Display mode unavailable'); return; }
  setFastDrawing(fast);
  setDisplayBusy(refresh.busy());
}
setInterval(() => {
  const mode = refresh.mode();
  if (mode >= 0) setFastDrawing(mode === 1);
  setDisplayBusy(refresh.busy());
}, 100);

function fileOf(index: i32, ext: string): string {
  return `${DIR}/page-${index + 1}.${ext}`;
}

/** Loads page-1.json, page-2.json... until one is missing; shows the first page. */
export function loadPages(): void {
  let i = 0;
  while (fs.exists(fileOf(i, 'json'))) {
    try { pages[i] = parseStrokes(fs.readText(fileOf(i, 'json'))); } catch (e) { pages[i] = []; }
    i++;
  }
  if (i > 0) { setPageCount(i); ink.setStrokes(pages[0]); }
}

/** Writes the current page as JSON (reloadable) and SVG (for sharing). */
export function savePage(): boolean {
  pages[page()] = ink.strokes;
  try {
    fs.mkdir(DIR);
    fs.writeText(fileOf(page(), 'json'), ink.toJSON());
    fs.writeText(fileOf(page(), 'svg'), ink.toSVG());
    setStatus(`saved ${fileOf(page(), 'svg')}`);
    return true;
  } catch (e) {
    setStatus(`save failed: ${e.message}`);
    return false;
  }
}

/** Shows page `index`, creating it when it is one past the last. */
export function goToPage(index: i32): void {
  if (index < 0) return;
  pages[page()] = ink.strokes;
  if (index >= pages.length) { pages.push([]); setPageCount(pages.length); }
  ink.setStrokes(pages[index]);
  setPage(index);
  setStatus('');
}

export function pickTool(name: string): void {
  setTool(name);
  ink.eraser = name === 'eraser';
}

export function pickColor(c: i32): void {
  setColor(c);
  ink.color = c;
  pickTool('pen');
}

export function pickWidth(w: number): void {
  setPenWidth(w);
  ink.width = w;
}
