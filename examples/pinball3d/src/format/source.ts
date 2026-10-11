// Where a table comes from. A table is a folder while one works on it (table.json and the files it names: models,
// images, sounds), and one package file to share it. The game opens both, and the tables it ships with from its own
// assets. A source only gives files by name; the loader and the builders never see a path.
import * as fs from 'zinc:fs';
import * as assets from 'zinc:assets';
import { TextDecoder, TextEncoder } from 'zinc:web';

export const PACKAGE_FORMAT = 'zinc-pinball-package';
/** The extension of a package file. */
export const PACKAGE_EXT = '.zpinball';
/** The entry of a package that says what it is: { format, version, files: the names of the table's files, table.json first }. */
export const PACKAGE_INDEX = 'package.json';
export const PACKAGE_VERSION = 2;

export class TableSource {
  /** True for a package: it holds every file its table names, or it is refused (loadTable). */
  whole: boolean = false;
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

/** One file that holds a table and its files: a ZPK pack of the engine (docs/zpk.md), its entries the files by their names and
 *  PACKAGE_INDEX. Every file is read when the package is opened, and a pack checks each entry against the checksum it was
 *  written with: a package that lost a file or had one altered is refused there, by the name of the file. */
export class PackageSource extends TableSource {
  origin: string;
  names: string[] = [];
  data: u8[][] = [];
  /** `path`: the package file; `origin`: what messages call it. */
  constructor(path: string, origin: string) {
    super();
    this.origin = origin;
    this.whole = true;
    try { assets.mount(path); } catch (e) { throw new Error(`${origin}: not a table package (${reason(e as Error)})`); }
    // mounted for the time of the read only: two packages hold files of the same names
    let fault = '';
    try { this.read(); } catch (e) { fault = (e as Error).message; }
    assets.unmount(path);
    if (fault !== '') throw new Error(`${origin}: ${fault}`);
  }
  private read(): void {
    if (!assets.exists(PACKAGE_INDEX)) throw new Error(`not a table package (it has no "${PACKAGE_INDEX}")`);
    let p: any = null;
    try { p = JSON.parse(assets.readText(PACKAGE_INDEX)); } catch (e) { throw new Error(`the file "${PACKAGE_INDEX}" was altered after the package was made (${reason(e as Error)})`); }
    if (p === null || typeof p !== 'object' || p.format !== PACKAGE_FORMAT || !Array.isArray(p.files)) throw new Error(`not a table package ("format": "${PACKAGE_FORMAT}" with its "files")`);
    if (typeof p.version !== 'number' || p.version > PACKAGE_VERSION) throw new Error(`this game reads packages up to version ${PACKAGE_VERSION}, the file is version ${p.version}`);
    for (let i = 0; i < p.files.length; i++) {
      const name: string = `${p.files[i]}`;
      // ponytail: a name the pack lacks would be read from the game's own assets if they had it; they hold tables/<name>/ only
      if (!assets.exists(name)) throw new Error(`the file "${name}" is missing from the package`);
      let b: u8[] = [];
      try { b = assets.readBytes(name); } catch (e) { throw new Error(`the file "${name}" was altered after the package was made (${reason(e as Error)})`); }
      this.names.push(name);
      this.data.push(b);
    }
  }
  has(name: string): boolean { return this.names.indexOf(name) >= 0; }
  text(name: string): string { return new TextDecoder().decode(this.bytes(name)); }
  bytes(name: string): u8[] {
    const i = this.names.indexOf(name);
    if (i < 0) throw new Error(`${this.origin}: the package has no file "${name}"`);
    return this.data[i];
  }
  describe(): string { return this.origin; }
}
/** The engine's message without its "assets: " prefix. */
function reason(e: Error): string { return e.message.startsWith('assets: ') ? e.message.slice(8) : e.message; }

/** A package given as bytes (one of the game's own assets): a pack is read from a file, so it goes through a temporary one. */
export function packageOfBytes(bytes: u8[], origin: string): PackageSource {
  const dir = fs.mkdtemp(`${fs.tmpdir()}/zinc-pinball-`);
  fs.writeBytes(`${dir}/table${PACKAGE_EXT}`, bytes);
  let fault = '';
  let out: PackageSource | null = null;
  try { out = new PackageSource(`${dir}/table${PACKAGE_EXT}`, origin); } catch (e) { fault = (e as Error).message; }
  fs.remove(dir, true);
  if (out === null) throw new Error(fault);
  return out;
}

/** Opens a table by what the player gives: a package file, a table folder, or the table.json inside one. */
export function openTable(path: string): TableSource {
  if (path.endsWith(PACKAGE_EXT)) return new PackageSource(path, path);
  if (path.endsWith('.json')) { const cut = path.lastIndexOf('/'); return new FolderSource(cut < 0 ? '.' : path.slice(0, cut)); }
  return new FolderSource(path);
}

/** Writes the package `path` holding `files` of `from` (table.json first): what one shares. Nothing is written when a file is not there. */
export function packTable(from: TableSource, files: string[], path: string): void {
  const names: string[] = [PACKAGE_INDEX], data: u8[][] = [];
  data.push(new TextEncoder().encode(`${JSON.stringify({ format: PACKAGE_FORMAT, version: PACKAGE_VERSION, files: files })}\n`));
  for (const name of files) {
    if (!from.has(name)) throw new Error(`${from.describe()}: the table names the file "${name}", which is not there`);
    names.push(name);
    data.push(from.bytes(name));
  }
  assets.writePack(path, names, data);
}
