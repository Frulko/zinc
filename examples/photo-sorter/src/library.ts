// The photo library on disk: finding the pictures of the source folders, filing one into an album folder (moved or copied), the trash, and
// undoing each of those. Everything is a plain zinc:fs operation, so a sorted folder is a folder like any other.
//
// The trash is in two steps: a picture thrown away waits in `.trieur-trash` next to where it was (a move on its own disk, so it can come
// back at once, and undo works), and the summary empties it into the system's trash (Finder's, where it can still be put back) or restores it.

import * as fs from 'zinc:fs';
import { info, type ImageInfo } from 'zinc:imageio';

export const TRASH_DIR = '.trieur-trash';
const EXTS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'tif', 'tiff', 'avif', 'bmp', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2']);

export interface Photo {
  path: string;
  name: string;
  /** the source folder it was found under */
  source: string;
  size: number;
  mtime: number;
}

export interface Album { id: string; label: string; icon: string; color: string }

export interface Settings {
  sources: string[];
  /** '' : file into album folders inside each source folder */
  output: string;
  mode: 'move' | 'copy';
  albums: Album[];
}

export const join = (a: string, b: string): string => (a.endsWith('/') ? a + b : a + '/' + b);
export const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
export const dirName = (p: string): string => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
const ext = (name: string): string => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); };

/** The pictures under the sources, oldest first; hidden folders, the trash and the album folders already made are left out. */
export function scan(s: Settings): Photo[] {
  const skip = new Set(s.albums.map((a) => a.label));
  const out: Photo[] = [];
  const walk = (dir: string, source: string, depth: number): void => {
    let entries: fs.DirEntry[] = [];
    try { entries = fs.readDir(dir); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory) { if (depth < 6 && !(skip.has(e.name) && (s.output === '' ? true : dir === s.output))) walk(p, source, depth + 1); continue; }
      if (!e.isFile || !EXTS.has(ext(e.name))) continue;
      try { const st = fs.stat(p); out.push({ path: p, name: e.name, source, size: st.size, mtime: st.mtimeMs }); } catch { /* gone meanwhile */ }
    }
  };
  for (const src of s.sources) walk(src, src, 0);
  return out.sort((a, b) => a.mtime - b.mtime || (a.path < b.path ? -1 : 1));
}

const infos = new Map<string, ImageInfo | null>();
/** The picture's header and EXIF, read once. */
export function infoOf(p: Photo): ImageInfo | null {
  if (!infos.has(p.path)) infos.set(p.path, info(p.path));
  return infos.get(p.path)!;
}

/** 'Fujifilm X-T4', 'Canon EOS 5D Mark III' (Canon's model already names the maker), '' when unknown. */
export function cameraName(i: ImageInfo): string {
  const make = i.make.trim(), model = i.model.trim();
  return model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0]!) ? model : `${make} ${model}`.trim();
}

/** When it was taken: the camera's date, else the file's. */
export function takenAt(p: Photo): Date {
  const d = infoOf(p)?.date;
  return d ? new Date(d) : new Date(p.mtime);
}

/** What the model may look at: where it comes from, the camera, the shape, when; never the album it went to. */
export function meta(p: Photo): Record<string, unknown> {
  const i = infoOf(p), when = takenAt(p);
  const camera = i ? cameraName(i) : '';
  return {
    folder: baseName(dirName(p.path)),
    format: i?.format ?? ext(p.name),
    camera: camera || 'unknown camera',
    tag: [
      i && i.width >= i.height ? 'landscape' : 'portrait',
      i?.location ? 'geotagged' : 'no-gps',
      `year-${when.getFullYear()}`,
      `month-${when.getMonth() + 1}`,
      p.size > 8e6 ? 'large' : 'small',
    ],
  };
}

/** A name free in `dir`: `name`, else `name (2)`, `name (3)`... */
function free(dir: string, name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot < 0 ? name : name.slice(0, dot), tail = dot < 0 ? '' : name.slice(dot);
  let p = join(dir, name);
  for (let n = 2; fs.exists(p); n++) p = join(dir, `${stem} (${n})${tail}`);
  return p;
}

function move(from: string, to: string): void {
  try { fs.rename(from, to); }
  catch (e) {
    if (!String(e).includes('EXDEV')) throw e;
    fs.copyFile(from, to);   // another disk: copy (the date is kept), then remove
    fs.remove(from);
  }
}

/** One change made on disk for a picture, enough to take it back. */
export type Op = { kind: 'move' | 'copy' | 'trash'; from: string; to: string };

/** Files the picture into the albums: the first by the chosen mode, the others as copies. */
export function file(p: Photo, albums: Album[], s: Settings): Op[] {
  const ops: Op[] = [];
  let at = p.path;
  albums.forEach((a, i) => {
    const dir = join(s.output === '' ? p.source : s.output, a.label);
    fs.mkdir(dir, true);
    const to = free(dir, p.name);
    if (i === 0 && s.mode === 'move') { move(at, to); ops.push({ kind: 'move', from: at, to }); at = to; }
    else { fs.copyFile(at, to); ops.push({ kind: 'copy', from: at, to }); }
  });
  return ops;
}

/** Puts the picture aside in the trash of its folder. */
export function throwAway(p: Photo): Op[] {
  const dir = join(dirName(p.path), TRASH_DIR);
  fs.mkdir(dir, true);
  const to = free(dir, p.name);
  fs.rename(p.path, to);
  return [{ kind: 'trash', from: p.path, to }];
}

/** Takes the changes back, the last first. */
export function revert(ops: Op[]): void {
  for (const op of [...ops].reverse()) {
    if (op.kind === 'copy') fs.remove(op.to);
    else move(op.to, op.from);
    removeIfEmpty(dirName(op.to));   // the album folder this one opened
  }
}

export function removeIfEmpty(dir: string): void {
  try { if (fs.list(dir).length === 0) fs.remove(dir); } catch { /* gone already */ }
}
