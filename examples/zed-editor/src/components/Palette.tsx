// Command palette (⌘⇧P) and file finder (⌘P): zinc:command-palette's floating list with a query field, in Zed's denser look.
// Items are fuzzy-matched (a file by its path, its name first); the panel fades and grows in (paletteT).
import { Palette as PaletteView, PaletteItem, fuzzy, Fuzzy, ranked } from 'zinc:command-palette';
import { theme } from 'zinc:editor';
import { COMMANDS, paletteMode, paletteT, closePalette, PAL_FILES } from '../app/commands';
import { allFiles, Entry, root } from '../app/project';
import { buffers, openFile, focusLater } from '../app/workspace';
import { drawFileIcon } from './icons';
import { Kbd } from './Controls';

const MAX_ITEMS: i32 = 60;

function dirOf(path: string): string {
  const rel = path.startsWith(root.path + '/') ? path.slice(root.path.length + 1) : path;
  const s = rel.lastIndexOf('/');
  return s < 0 ? '' : rel.slice(0, s);
}

/** Items for the current mode and query, best first. */
function items(q: string): PaletteItem[] {
  const out: PaletteItem[] = [];
  if (paletteMode() === PAL_FILES) {
    // open files first when there is no query (most recent tab order), then the whole project
    const seen = new Set<string>();
    if (q === '') for (const b of buffers()) { seen.add(b.path); out.push(new PaletteItem(b.name, dirOf(b.path), '', b.path, () => { openFile(b.path, b.name, false); })); }
    for (const e of allFiles()) {
      if (seen.has(e.path)) continue;
      const rel = e.rel(), cut = rel.length - e.name.length;
      const it = new PaletteItem(e.name, cut > 0 ? rel.slice(0, cut - 1) : '', '', e.path, () => { openFile(e.path, e.name, false); });
      if (q !== '') {
        const m = fuzzy(q, rel, cut);
        if (m === null) continue;
        it.score = (m as Fuzzy).score;
        for (const h of (m as Fuzzy).hits) { if (h >= cut) it.labelHits.push(h - cut); else it.detailHits.push(h); }
      }
      out.push(it);
    }
  } else {
    for (const c of COMMANDS) {
      const it = new PaletteItem(c.name, '', c.keys, '', c.run);
      if (q !== '') {
        const m = fuzzy(q, c.name, 0);
        if (m === null) continue;
        it.score = (m as Fuzzy).score; it.labelHits = (m as Fuzzy).hits;
      }
      out.push(it);
    }
  }
  return ranked(out, q, MAX_ITEMS);
}

export function Palette(): i32 {
  return <PaletteView dense mode={() => paletteMode()} progress={() => paletteT.get()} items={items} onClose={() => closePalette()}
    focus={(h: i32) => focusLater(h)} kbd={(keys: string) => <Kbd keys={keys} />}
    icon={(it: PaletteItem, x: i32, y: i32, size: i32) => drawFileIcon(it.label, false, false, x, y, size, theme())}
    placeholder={() => paletteMode() === PAL_FILES ? 'Search project files…' : 'Execute a command…'}
    empty={() => 'No matches'} />;
}
