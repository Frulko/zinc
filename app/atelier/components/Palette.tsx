// The palette (⌘⇧P, zinc:command-palette): every command of the menu, the libraries (the plugins `zinc plugins` lists; Enter adds
// the import line to the sketch), the templates of `zinc new`, and the sketch's files (⌘P, the + of the tabs). Items are
// fuzzy-matched; the panel fades and grows in (paletteT).
import { Palette as PaletteView, PaletteItem, fuzzy, Fuzzy, ranked } from 'zinc:command-palette';
import { noteKey } from 'zinc:editor';
import { COMMANDS, command, paletteMode, paletteT, closePalette, PAL_LIBRARIES, PAL_FILES, PAL_TEMPLATES, keysText, addLibrary, fromTemplate } from '../app/commands';
import { focusLater, sketchDir, sketchFiles, buffers, openFile } from '../app/workspace';
import { libraries, templates, Library, Template } from '../app/tools';
import { t as tr } from '../app/text';
import { Kbd } from './Controls';

const MAX_ITEMS: i32 = 80;
/** The query's match in `label` (from `nameFrom`), or false when it does not match. */
function matched(it: PaletteItem, q: string, nameFrom: i32): boolean {
  if (q === '') return true;
  const m = fuzzy(q, it.label, nameFrom);
  if (m === null) return false;
  it.score = (m as Fuzzy).score; it.labelHits = (m as Fuzzy).hits;
  return true;
}

/** Items for the current mode and query, best first. */
function items(q: string): PaletteItem[] {
  const mode = paletteMode();
  const out: PaletteItem[] = [];
  if (mode === PAL_LIBRARIES || mode === PAL_TEMPLATES) {
    // the plugins a sketch can import, or the templates of `zinc new`: a name and what it is
    const list = mode === PAL_LIBRARIES ? libraries().map((l: Library): string[] => [l.name, l.text]) : templates().map((m: Template): string[] => [m.name, m.text]);
    for (const l of list) {
      const name = l[0];
      const it = new PaletteItem(name, l[1].length > 84 ? l[1].slice(0, 82) + '…' : l[1], '', '', () => { if (mode === PAL_LIBRARIES) addLibrary(name); else fromTemplate(name); });
      if (matched(it, q, 0)) out.push(it);
    }
  } else if (mode === PAL_FILES) {
    // every source file of the sketch, in its folders too: the way to the files that have no tab yet
    const dir = sketchDir();
    if (q === '') out.push(new PaletteItem(tr('atelier.palette.new_file'), tr('atelier.palette.new_file_detail'), '⌘T', '', () => { command('add-file'); }));
    for (const f of sketchFiles(dir)) {
      let open = false;
      for (const b of buffers()) if (b.path === dir + '/' + f) open = true;
      const it = new PaletteItem(f, open ? tr('atelier.palette.open') : '', '', '', () => { openFile(dir + '/' + f); });
      if (matched(it, q, f.lastIndexOf('/') + 1)) out.push(it);
    }
  } else {
    for (const c of COMMANDS) {
      const it = new PaletteItem(c.name(), tr('atelier.menu.' + c.menu), keysText(c.keys), '', c.run);
      if (matched(it, q, 0)) out.push(it);
    }
  }
  return ranked(out, q, MAX_ITEMS);
}

export function Palette(): i32 {
  return <PaletteView mode={() => paletteMode()} progress={() => paletteT.get()} items={items} onClose={() => closePalette()}
    focus={(h: i32) => focusLater(h)} onKey={noteKey} kbd={(keys: string) => <Kbd keys={keys} />}
    placeholder={() => tr(paletteMode() === PAL_LIBRARIES ? 'atelier.palette.libraries' : paletteMode() === PAL_FILES ? 'atelier.palette.files' : paletteMode() === PAL_TEMPLATES ? 'atelier.palette.templates' : 'atelier.palette.commands')}
    empty={() => tr('atelier.palette.no_matches')} />;
}
