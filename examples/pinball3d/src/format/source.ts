// Where a table comes from. A table is a folder while one works on it (table.json and the files it names: models,
// images, sounds), and one package file to share it. The game opens both, and the tables it ships with from its own
// assets. A source only gives files by name; the loader and the builders never see a path.
import * as fs from 'zinc:fs';
import * as assets from 'zinc:assets';
import { base64Decode, base64Encode, TextDecoder, TextEncoder } from 'zinc:web';

export const PACKAGE_FORMAT = 'zinc-pinball-package';
/** The extension of a package file. */
export const PACKAGE_EXT = '.zpinball';

export class TableSource {
  /** Whether the file exists. */
  has(name: string): boolean { return false; }
  text(name: string): string { return ''; }
  bytes(name: string): u8[] { return []; }
  /** For messages: where this is. */
  describe(): string { return 'a table'; }
}

/** A folder on disk: <dir>/table.json and its files. */
export class FolderSource extends TableSource {
  dir: string;
  constructor(dir: string) { super(); this.dir = dir; }
  has(name: string): boolean { return fs.exists(`${this.dir}/${name}`); }
  text(name: string): string { return fs.readText(`${this.dir}/${name}`); }
  bytes(name: string): u8[] { return fs.readBytes(`${this.dir}/${name}`); }
  describe(): string { return this.dir; }
}

/** A table that ships with the game: assets/tables/<name>/. */
export class BuiltinSource extends TableSource {
  prefix: string;
  constructor(name: string) { super(); this.prefix = `tables/${name}/`; }
  has(name: string): boolean { return assets.exists(this.prefix + name); }
  text(name: string): string { return assets.readText(this.prefix + name); }
  bytes(name: string): u8[] { return assets.readBytes(this.prefix + name); }
  describe(): string { return `the table "${this.prefix.slice(7, this.prefix.length - 1)}"`; }
}

/** One file that holds a table and its files: JSON, { format, version, files: [{ name, text } or { name, base64 }] }. */
export class PackageSource extends TableSource {
  origin: string;
  names: string[] = [];
  texts: string[] = [];
  /** True when the entry of the same index is base64 of bytes, false when it is text. */
  binary: boolean[] = [];
  constructor(text: string, origin: string) {
    super();
    this.origin = origin;
    let p: any = null;
    try { p = JSON.parse(text); } catch (e) { throw new Error(`${origin}: the package is not JSON: ${(e as Error).message}`); }
    if (p === null || typeof p !== 'object' || p.format !== PACKAGE_FORMAT || !Array.isArray(p.files)) throw new Error(`${origin}: not a table package ("format": "${PACKAGE_FORMAT}" with its "files")`);
    if (typeof p.version !== 'number' || p.version > 1) throw new Error(`${origin}: this game reads packages of version 1, the file is version ${p.version}`);
    for (let i = 0; i < p.files.length; i++) {
      const f: any = p.files[i];
      const isText = typeof f.text === 'string';
      if (typeof f.name !== 'string' || (!isText && typeof f.base64 !== 'string')) throw new Error(`${origin}: files[${i}] needs a "name" and a "text" or a "base64"`);
      this.names.push(f.name);
      this.texts.push(isText ? f.text : f.base64);
      this.binary.push(!isText);
    }
  }
  private at(name: string): i32 { return this.names.indexOf(name); }
  has(name: string): boolean { return this.at(name) >= 0; }
  text(name: string): string {
    const i = this.at(name);
    if (i < 0) throw new Error(`${this.origin}: the package has no file "${name}"`);
    return this.binary[i] ? new TextDecoder().decode(base64Decode(this.texts[i])) : this.texts[i];
  }
  bytes(name: string): u8[] {
    const i = this.at(name);
    if (i < 0) throw new Error(`${this.origin}: the package has no file "${name}"`);
    return this.binary[i] ? base64Decode(this.texts[i]) : new TextEncoder().encode(this.texts[i]);
  }
  describe(): string { return this.origin; }
}

/** Opens a table by what the player gives: a package file, a table folder, or the table.json inside one. */
export function openTable(path: string): TableSource {
  if (path.endsWith(PACKAGE_EXT)) return new PackageSource(fs.readText(path), path);
  if (path.endsWith('.json')) { const cut = path.lastIndexOf('/'); return new FolderSource(cut < 0 ? '.' : path.slice(0, cut)); }
  return new FolderSource(path);
}

function isTextFile(name: string): boolean { return name.endsWith('.json') || name.endsWith('.obj') || name.endsWith('.txt') || name.endsWith('.svg'); }

/** The text of a package holding `files` of `from` (table.json first): what one shares. */
export function packTable(from: TableSource, files: string[]): string {
  const parts: string[] = [];
  for (const name of files) {
    if (!from.has(name)) throw new Error(`${from.describe()}: the table names the file "${name}", which is not there`);
    parts.push(isTextFile(name) ? `    { "name": ${JSON.stringify(name)}, "text": ${JSON.stringify(from.text(name))} }`
      : `    { "name": ${JSON.stringify(name)}, "base64": "${base64Encode(from.bytes(name))}" }`);
  }
  return `{\n  "format": "${PACKAGE_FORMAT}",\n  "version": 1,\n  "files": [\n${parts.join(',\n')}\n  ]\n}\n`;
}
