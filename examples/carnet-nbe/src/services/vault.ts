// The vault: one Markdown file per page in a folder (CARNET_VAULT, else `vault/` beside the app), seeded from `welcome/` the
// first time, read and written by @nbe/markdown (Carnet's own Markdown, front matter included: the files are the ones the web
// app reads). A page is written a moment after its last change, by every window that has it (they write the same text).
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { markdownToDocument, documentToMarkdown, Frontmatter } from '@nbe/markdown';
import { Page, addPage, pageJSON } from '../state';
import { SAVE_DELAY_S } from '../constants';

let dir = '';
const pending = new Map<string, number>();        // page id -> seconds since its last change
const headers = new Map<string, Frontmatter>();   // page id -> its front matter as read (keys we do not know are kept)

function folder(): string {
  if (dir === '') { const env = sys.env('CARNET_VAULT'); dir = env !== '' ? env : 'vault'; }
  return dir;
}

/** Reads every page of the vault and seeds its document (the window that serves does this; see state.addPage). */
export function openVault(): void {
  const d = folder();
  if (!fs.exists(d)) {
    fs.mkdir(d, true);
    if (fs.exists('welcome')) for (const name of fs.list('welcome')) if (name.endsWith('.md')) fs.copyFile('welcome/' + name, d + '/' + name);
  }
  const names = fs.list(d).filter((n: string) => n.endsWith('.md')).sort();
  for (const name of names) {
    let doc;
    try { doc = markdownToDocument(fs.readText(d + '/' + name)); } catch (e) { console.log(`carnet: cannot read ${name}: ${e}`); continue; }
    const id = name.slice(0, -3), fm = doc.frontmatter;
    let blocks = doc.blocks, title = String(fm.get('title') ?? '');
    if (title === '' && blocks.length > 0 && blocks[0].type === 'heading' && blocks[0].props?.['level'] === 1) {   // a plain Markdown file: its first # line
      title = (blocks[0].text ?? []).map((r: any) => r.text).join('');
      blocks = blocks.slice(1);
    }
    if (blocks.length === 0) blocks = [{ id: `${id}-0`, type: 'paragraph', version: 1, props: {}, text: [] }];
    headers.set(id, fm);
    addPage({ id, type: 'page', version: 1, props: { title, icon: String(fm.get('icon') ?? 'file-text') }, children: blocks });
  }
}

/** A page changed: written SAVE_DELAY_S after its last change (stepVault). */
export function pageChanged(p: Page): void { pending.set(p.id, 0); }

function write(p: Page): void {
  if (!fs.exists(folder())) fs.mkdir(folder(), true);   // a window that joined has not read a vault of its own
  const path = `${folder()}/${p.id}.md`;
  const json = pageJSON(p);
  if (json === null || json === undefined) return;
  let fm = headers.get(p.id);
  if (fm === undefined) { fm = Frontmatter.parse(''); headers.set(p.id, fm); }
  fm.set('title', p.title() !== '' ? p.title() : undefined).set('icon', p.icon());
  try { fs.writeText(path, documentToMarkdown({ frontmatter: fm, blocks: json.children ?? [] })); } catch (e) { console.log(`carnet: cannot write ${path}: ${e}`); }
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
