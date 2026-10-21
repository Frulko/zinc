// The vault: one Markdown file per page in a folder (CARNET_VAULT, else `vault/` beside the app), seeded from `welcome/` the
// first time. A page is written a moment after its last change, by whoever changed it (two windows on one machine write the
// same converged text).
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Page, Block, addLoadedPage, addLoadedBlock } from '../state';
import { MdPage, MdBlock, toMarkdown, fromMarkdown } from '../markdown';
import { SAVE_DELAY_S } from '../constants';

let dir = '';
const pending = new Map<string, number>();   // page id -> seconds since its last change

export function vaultDir(): string { return dir; }

/** Opens the vault and loads its pages (ids from the file names, block ids from their place: two windows that load the same
 *  files agree on every id). */
export function openVault(): void {
  const env = sys.env('CARNET_VAULT');
  dir = env !== '' ? env : 'vault';
  if (!fs.exists(dir)) {
    fs.mkdir(dir, true);
    if (fs.exists('welcome')) for (const name of fs.list('welcome')) if (name.endsWith('.md')) fs.copyFile('welcome/' + name, dir + '/' + name);
  }
  const names = fs.list(dir).filter((n: string) => n.endsWith('.md'));
  names.sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0);
  let order: number = 0;
  for (const name of names) {
    let md: MdPage;
    try { md = fromMarkdown(fs.readText(dir + '/' + name)); } catch (e) { continue; }
    order++;
    const id = name.slice(0, name.length - 3);
    const p = addLoadedPage(id, md.order !== 0 ? md.order : order, md.title, md.icon !== '' ? md.icon : 'file-text');
    let i: i32 = 0;
    for (const b of md.blocks) { addLoadedBlock(p, `${id}:${i}`, b.type, b.text, b.checked, b.indent); i++; }
    if (md.blocks.length === 0) addLoadedBlock(p, `${id}:0`, 'p', '', false, 0);
  }
}

/** A page changed: written SAVE_DELAY_S after its last change (stepVault). */
export function pageChanged(p: Page): void { pending.set(p.id, 0); }

function write(p: Page): void {
  const path = `${dir}/${p.id}.md`;
  if (p.deleted) { if (fs.exists(path)) fs.remove(path); return; }
  const md = new MdPage();
  md.title = p.title(); md.icon = p.icon(); md.order = p.pos;
  for (const b of p.items) md.blocks.push(new MdBlock(b.type(), b.text(), b.checked(), b.indent()));
  try { fs.writeText(path, toMarkdown(md)); } catch (e) { console.log(`carnet: cannot write ${path}: ${e}`); }
}

/** Once per frame: writes the pages whose last change is old enough; `all` writes every pending page now (quitting). */
export function stepVault(dt: number, lookup: (id: string) => Page | null, all: boolean): void {
  if (pending.size === 0) return;
  const due: string[] = [];
  pending.forEach((age: number, id: string) => { if (all || age + dt >= SAVE_DELAY_S) due.push(id); else pending.set(id, age + dt); });
  for (const id of due) {
    pending.delete(id);
    const p = lookup(id);
    if (p !== null) write(p);
  }
}
