// Assets panel data: the files of <project>/assets, their kind and size, import (copy a file in) and previews.
// Previews decode at run time: SVG with zinc:svg, Lottie with zinc:lottie, PNG / JPEG / video frames with
// zinc:video (FFmpeg reads still images too). Boxes reference assets by file name.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import * as gfx from 'zinc:gfx';
import * as video from 'zinc:video';
import * as lottie from 'zinc:lottie';
import { Svg } from 'zinc:svg';
import { join, basename } from './project';

export class Asset {
  name: string; kind: string; size: string;
  constructor(name: string, kind: string, size: string) { this.name = name; this.kind = kind; this.size = size; }
}
/** image | svg | lottie | video | font | text | file */
export function kindOf(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image';
  if (n.endsWith('.svg')) return 'svg';
  if (n.endsWith('.json')) return 'lottie';
  if (n.endsWith('.ttf') || n.endsWith('.otf')) return 'font';
  if (video.isVideo(n, video.EXTENSIONS)) return 'video';
  if (n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.html') || n.endsWith('.css')) return 'text';
  return 'file';
}
function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const [listSig, setList] = createSignal<Asset[]>([]);
export function assets(): Asset[] { return listSig(); }
export function assetNames(kinds: string[]): string[] {
  return listSig().filter((a: Asset) => kinds.length === 0 || kinds.indexOf(a.kind) >= 0).map((a: Asset) => a.name);
}

/** Re-reads <dir>/assets; sizes come from one `stat` call. */
export async function refresh(dir: string): Promise<void> {
  const root = join(dir, 'assets');
  let names: string[] = [];
  try { names = fs.list(root).filter((n: string) => !n.startsWith('.')); } catch (e) { names = []; }
  names.sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0);
  setList(names.map((n: string) => new Asset(n, kindOf(n), '')));
  if (names.length === 0) return;
  try {
    const r = await proc.run('stat', ['-f', '%z'].concat(names.map((n: string) => join(root, n))), {});
    const sizes = r.stdout.split('\n');
    setList(names.map((n: string, i: i32) => new Asset(n, kindOf(n), i < sizes.length && sizes[i] !== '' ? human(parseFloat(sizes[i])) : '')));
  } catch (e) { /* sizes stay empty */ }
}

/** Copies a file into <dir>/assets; resolves with an error message ('' on success). */
export async function importFile(dir: string, src: string): Promise<string> {
  const path = src.trim();
  if (path === '') return 'Type the path of a file to import';
  if (!fs.exists(path)) return `Not found: ${path}`;
  fs.mkdir(join(dir, 'assets'));
  try {
    // the path is passed as one argument, never through a shell
    const r = await proc.run('cp', ['--', path, join(join(dir, 'assets'), basename(path))], {});
    if (r.code !== 0) return r.stderr.trim();
  } catch (e) { return 'cp failed'; }
  await refresh(dir);
  return '';
}

// ---------------------------------------------------------------- previews
let shown = '';
let svgDoc: Svg | null = null;
let player: video.Player | null = null;
let anim = -1;
let animPlayer: lottie.Player | null = null;
let lastT = 0;
/** Loads the preview of `name` (path under the project) if it changed; returns false when none is possible. */
function load(dir: string, name: string): void {
  const key = join(dir, name);
  if (key === shown) return;
  closePreview();
  shown = key;
  const path = join(join(dir, 'assets'), name), kind = kindOf(name);
  try {
    if (kind === 'svg') svgDoc = new Svg(fs.readText(path));
    else if (kind === 'lottie') { anim = lottie.parse(fs.readText(path)); const p = new lottie.Player(anim); p.loop = true; p.play(); animPlayer = p; }
    else if (kind === 'image' || kind === 'video') { const p = new video.Player(0, 0); p.background = 0xf4f4f5; p.add(path); p.repeat = video.LOOP; p.play(); player = p; }
  } catch (e) { console.warn('studio: no preview for', name); }
}
export function closePreview(): void {
  shown = '';
  const s = svgDoc; if (s !== null) s.dispose(); svgDoc = null;
  const p = player; if (p !== null) p.close(); player = null;
  animPlayer = null;
  if (anim >= 0) lottie.free(anim);
  anim = -1;
}
/** Draws the asset fitted in the box (aspect kept); returns the intrinsic size text ('' when unknown). */
export function drawPreview(dir: string, name: string, x: number, y: number, w: number, h: number): string {
  load(dir, name);
  let iw = 0, ih = 0;
  const s = svgDoc, p = player, a = animPlayer;
  if (s !== null && s.ok) { iw = s.width; ih = s.height; }
  else if (p !== null) { iw = p.width; ih = p.height; }
  else if (a !== null) { iw = lottie.width(anim); ih = lottie.height(anim); }
  if (iw <= 0 || ih <= 0) return '';
  const k = Math.min(Math.min(w / iw, h / ih), 4);
  const dw = iw * k, dh = ih * k, ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
  if (s !== null) s.draw(ox, oy, dw, dh, 255);
  else if (p !== null) { const img = p.image; if (img >= 0) gfx.drawImage(img, ox, oy, dw, dh, 255, 0); }
  else if (a !== null) {
    const now = gfx.frame();
    a.update(lastT === 0 ? 0 : 1 / 60);
    lastT = now;
    a.draw(ox, oy, dw, dh);
  }
  return `${Math.round(iw)} x ${Math.round(ih)}`;
}
