// The files of the table's folder: the images, sounds and models the table names, and what lies there that it does not name.
// A file field of the format is a choice among the files of its kind (form.tsx), each with what tells it from the others: the
// picture of an image, the length of a sound, the triangles of a model. A file from elsewhere is imported: copied into the folder
// (the system's file dialog, or a file dropped on the window). What was read of a file is kept until Refresh, which reads the
// folder again and has the table drawn and heard from the files as they are now.
// Which field names a file comes from the schema (Kind.Asset and its kind): a file field added to the format is found here.
import { createSignal, batch } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as dialog from 'zinc:system/dialog';
import { imageWidth, imageHeight } from 'zinc:gfx';
import { decode, Sound } from 'zinc:audio';
import { parseObj } from 'zinc:3d';
import { Schema, Kind } from '../../pinball-kit/format/schema';
import { formatSchema, TABLE_FILE } from '../../pinball-kit/format/table';
import { FILE_KINDS, fileKind } from '../../pinball-kit/format/table-schema';
import { FolderSource } from '../../pinball-kit/format/source';
import { tableImage, forgetImages } from '../../pinball3d/src/images';
import { doc, folder, select, selected, save, say, setField, refresh } from './state';
import { rebuild, logging } from './play';
import * as L from './strings';
import { t, f } from './strings';

/** Counts the times the folder was read again: what shows files reads it. */
const [read, setRead] = createSignal<i32>(0);
// what is known of the folder that was last read: its files, and what was measured of each
let listedFor = '';
let listed: string[] = [];
const measured = new Map<string, number>();
const sounds = new Map<string, Sound>();
let heard: Sound | null = null;

function source(): FolderSource | null { return folder() === '' ? null : new FolderSource(folder()); }
function walk(dir: string, prefix: string, depth: i32, out: string[]): void {
  let entries: fs.DirEntry[] = [];
  try { entries = fs.readDir(dir); } catch (e) { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    // ponytail: three folders deep, which is one more than a table's own (art/, sounds/); deeper files are not offered
    if (e.isDirectory) { if (depth < 3) walk(`${dir}/${e.name}`, `${prefix}${e.name}/`, depth + 1, out); }
    else if (prefix !== '' || e.name !== TABLE_FILE) out.push(`${prefix}${e.name}`);
  }
}
function forget(): void {
  if (heard !== null) heard.stop();
  heard = null;
  for (const s of sounds.values()) s.unload();
  sounds.clear();
  measured.clear();
  listed = [];
  listedFor = '';
}
/** The files of the table's folder by their names from it ("art/cap.png"), sorted; the table file itself is not one of them. */
export function folderFiles(): string[] {
  read();
  const dir = folder();
  if (dir !== listedFor) { forget(); listedFor = dir; if (dir !== '') walk(dir, '', 0, listed); }
  return listed;
}
/** Those of one kind ('image', 'sound', 'model'). */
export function filesOfKind(kind: string): string[] { return folderFiles().filter((name: string) => fileKind(name) === kind); }

/** Every file field of the table that names a file: [its path, the file] rows, in the order of the file. */
export function named(): string[][] {
  const out: string[][] = [];
  const within = (s: Schema, v: any, at: string): void => {
    for (const fd of s.fields) {
      const x: any = v[fd.name], p = at === '' ? fd.name : `${at}.${fd.name}`;
      if (x === undefined || x === null) continue;
      if (fd.kind === Kind.Asset) { if (typeof x === 'string' && x !== '') out.push([p, `${x}`]); }
      else if (fd.kind === Kind.Obj) within(fd.of as Schema, x, p);
      else if (fd.kind === Kind.List) for (let i = 0; i < x.length; i++) within(fd.of as Schema, x[i], `${p}[${i}]`);
    }
  };
  within(formatSchema(), doc().data, '');
  return out;
}
/** The paths of the fields that name a file. */
export function usersOf(name: string): string[] { return named().filter((row: string[]) => row[1] === name).map((row: string[]) => row[0]); }
/** The files of the folder that no field of the table names. */
export function unusedFiles(): string[] {
  const used: string[] = named().map((row: string[]) => row[1]);
  return folderFiles().filter((name: string) => used.indexOf(name) < 0);
}
/** The files the table names that are not in its folder, each once. */
export function missingFiles(): string[] {
  const here = folderFiles(), out: string[] = [];
  for (const row of named()) if (here.indexOf(row[1]) < 0 && out.indexOf(row[1]) < 0) out.push(row[1]);
  return out;
}

/** The picture of an image file, for zinc:gfx; -1 for a file that is no image, or is not in the folder. */
export function pictureOf(name: string): i32 {
  read();
  const src = source();
  return src === null || fileKind(name) !== 'image' || folderFiles().indexOf(name) < 0 ? -1 : tableImage(src, name);
}
function soundOf(name: string): Sound | null {
  const src = source();
  if (src === null || folderFiles().indexOf(name) < 0) return null;
  let s = sounds.get(name);
  if (s === undefined) { s = decode(src.bytes(name), name); sounds.set(name, s); }
  return s;
}
/** What tells a file from the others, in a few words: the size of an image, the length of a sound, the triangles of a model;
 *  that it is missing when the folder does not hold it; '' when nothing is known of it. */
export function noteOf(name: string): string {
  if (name === '') return '';
  if (folderFiles().indexOf(name) < 0) return t(L.FILE_MISSING);
  const kind = fileKind(name), src = source();
  let n = measured.get(name);
  if (n === undefined && src !== null) {
    n = 0;
    try {
      if (kind === 'image') { const id = tableImage(src, name); if (id >= 0) n = imageWidth(id) * 65536 + imageHeight(id); }
      else if (kind === 'sound') { const s = soundOf(name); if (s !== null) n = s.duration; }
      else if (kind === 'model') { const m = parseObj(src.text(name)); n = m.triangles; m.dispose(); }
    } catch (e) { n = 0; }
    measured.set(name, n);
  }
  if (n === undefined || n <= 0) return '';
  return kind === 'image' ? `${Math.floor(n / 65536)} × ${n % 65536}` : kind === 'sound' ? f(L.SECONDS_LONG, n.toFixed(1)) : kind === 'model' ? f(L.TRIANGLES, `${n}`) : '';
}
/** Plays a sound file of the folder as it is (no volume, no pitch of a sound of the table); the one heard before stops. */
export function hearFile(name: string): void {
  if (heard !== null) heard.stop();
  heard = soundOf(name);
  if (heard !== null) { heard.loop = false; heard.play(); }
  if (logging) console.log(`preview: file ${name}${heard !== null && heard.ok ? '' : ' (not read as a sound)'}`);
}

/** Reads the folder again and forgets what was read of its files: the table is drawn and heard from the files as they are now. */
export function refreshFiles(): void {
  forgetImages();
  forget();
  rebuild();
  batch(() => { setRead(read() + 1); refresh(); });
  const all = folderFiles(), unused = unusedFiles(), missing = missingFiles();
  const told = `${f(L.FILES_READ, `${all.length}`)}${unused.length > 0 ? ` ${f(L.FILES_UNUSED, `${unused.length}`, unused.join(', '))}` : ''}${missing.length > 0 ? ` ${f(L.FILES_MISSING, `${missing.length}`, missing.join(', '))}` : ''}`;
  if (logging) console.log(told);
  say(told, missing.length > 0);
}
/** Copies a file into the table's folder and returns its name there: a sound goes to sounds/, an image or a model to art/, anything
 *  else to the top of the folder; a file that is already in the folder stays where it is. A file of the same name is replaced only
 *  after a question. '' when nothing was copied (the status bar says why). */
export async function importFile(from: string): Promise<string> {
  if (folder() === '' && !(await save())) return '';
  const dir = folder();
  if (from.startsWith(`${dir}/`)) return from.slice(dir.length + 1);
  const base = from.slice(from.lastIndexOf('/') + 1), kind = fileKind(base), sub = kind === 'sound' ? 'sounds' : kind === '' ? '' : 'art';
  const name = sub === '' ? base : `${sub}/${base}`;
  if (fs.exists(`${dir}/${name}`) && !(await dialog.confirm(f(L.ASK_REPLACE, name)))) { say(f(L.NOT_REPLACED, name)); return ''; }
  try {
    if (sub !== '' && !fs.exists(`${dir}/${sub}`)) fs.mkdir(`${dir}/${sub}`, true);
    fs.copyFile(from, `${dir}/${name}`);
  } catch (e) {
    say(f(L.CANNOT_IMPORT, base, `${(e as Error).message}`), true);
    return '';
  }
  refreshFiles();
  if (logging) console.log(`imported ${name}`);
  say(f(L.DONE_IMPORTED, name));
  return name;
}
/** Asks the system for a file (of a kind, or any for '') and imports it; with `path`, the field at that path then names it. */
export async function importFrom(kind: string, path: string): Promise<void> {
  const o = new dialog.OpenOptions();
  o.title = t(L.IMPORT_TITLE);
  for (const k of FILE_KINDS) if (kind === '' || k[0] === kind) o.filters.push(new dialog.Filter(k[0], k.slice(1)));
  const picked = await dialog.open(o);
  if (picked === null || picked.length === 0) { say(t(L.NOTHING_IMPORTED)); return; }
  const name = await importFile(picked[0]);
  if (name !== '' && path !== '') setField(path, name);
}
/** What a file of the folder is and what names it, in the status bar; the first thing that names it is selected. Returns false for
 *  a name that is no file of the folder. */
export function showFile(name: string): boolean {
  if (folderFiles().indexOf(name) < 0) return false;
  const users = usersOf(name), note = noteOf(name), what = note === '' ? name : `${name} (${note})`;
  const told = users.length === 0 ? f(L.FILE_UNUSED, what) : f(L.FILE_USED, what, users.join(', '));
  // the first thing that holds a field naming it: the field's path without its own step
  const holder = users.length === 0 ? selected() : users[0].slice(0, Math.max(0, users[0].lastIndexOf('.')));
  if (holder !== selected()) select(holder);
  if (logging) console.log(told);
  say(told);
  return true;
}
