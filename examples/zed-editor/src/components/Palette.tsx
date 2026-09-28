// Command palette (⌘⇧P) and file finder (⌘P): one floating list with a query field. Items are fuzzy-matched and
// the matched characters are drawn in the accent colour; ↑↓ choose, Enter runs, Esc closes. The panel fades and
// grows in (paletteT).
import { createSignal, createMemo, createNodeRef, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { COMMANDS, paletteMode, paletteT, closePalette, PAL_CLOSED, PAL_FILES } from '../app/commands';
import { allFiles, Entry, root } from '../app/project';
import { buffers, openFile, focusLater } from '../app/workspace';
import { fuzzy, segments, Fuzzy } from '../app/fuzzy';
import { drawFileIcon } from './icons';
import { Kbd } from './Controls';

class Item {
  label: string; detail: string; keys: string; path: string;
  labelHits: i32[]; detailHits: i32[]; score: number;
  run: () => void;
  constructor(label: string, detail: string, keys: string, path: string, run: () => void) {
    this.label = label; this.detail = detail; this.keys = keys; this.path = path; this.run = run;
    this.labelHits = []; this.detailHits = []; this.score = 0;
  }
}

const [query, setQuery] = createSignal<string>('');
const [cursor, setCursor] = createSignal<i32>(0);
const inputRef = createNodeRef(), listRef = createNodeRef();
const ROW: i32 = 30, MAX_ROWS: i32 = 12, MAX_ITEMS: i32 = 60;

function fileItem(e: Entry): Item {
  const rel = e.rel(), slash = rel.lastIndexOf('/');
  return new Item(e.name, slash < 0 ? '' : rel.slice(0, slash), '', e.path, () => { openFile(e.path, e.name, false); });
}

/** Items for the current mode and query, best first. */
const items = createMemo<Item[]>(() => {
  const mode = paletteMode(), q = query().trim();
  if (mode === PAL_CLOSED) return [];
  const out: Item[] = [];
  if (mode === PAL_FILES) {
    // open files first when there is no query (most recent tab order), then the whole project
    const seen = new Set<string>();
    if (q === '') for (const b of buffers()) { seen.add(b.path); out.push(new Item(b.name, dirOf(b.path), '', b.path, () => { openFile(b.path, b.name, false); })); }
    for (const e of allFiles()) {
      if (seen.has(e.path)) continue;
      const it = fileItem(e);
      if (q !== '') {
        const rel = e.rel(), m = fuzzy(q, rel, rel.length - e.name.length);
        if (m === null) continue;
        const f = m as Fuzzy, cut = rel.length - e.name.length;
        it.score = f.score;
        for (const h of f.hits) { if (h >= cut) it.labelHits.push(h - cut); else it.detailHits.push(h); }
      }
      out.push(it);
    }
  } else {
    for (const c of COMMANDS) {
      const it = new Item(c.name, '', c.keys, '', c.run);
      if (q !== '') {
        const m = fuzzy(q, c.name, 0);
        if (m === null) continue;
        it.score = (m as Fuzzy).score; it.labelHits = (m as Fuzzy).hits;
      }
      out.push(it);
    }
  }
  if (q !== '') out.sort((a: Item, b: Item): number => b.score - a.score);
  return out.length > MAX_ITEMS ? out.slice(0, MAX_ITEMS) : out;
}, []);

function dirOf(path: string): string {
  const rel = path.startsWith(root.path + '/') ? path.slice(root.path.length + 1) : path;
  const s = rel.lastIndexOf('/');
  return s < 0 ? '' : rel.slice(0, s);
}

function run(it: Item): void { closePalette(); it.run(); }

function select(i: i32): void {
  const n = items().length;
  if (n === 0) return;
  const k = ((i % n) + n) % n;
  setCursor(k);
  const sc = listRef.node;
  if (sc < 0) return;
  const top = ui.scrollTop(sc), y = k * ROW, h = Math.min(n, MAX_ROWS) * ROW;
  if (y < top) ui.scrollTo(sc, 0, y);
  else if (y + ROW > top + h) ui.scrollTo(sc, 0, y + ROW - h);
}

function paletteKey(e: ui.KeyEvent): void {
  if (e.key === 'ArrowDown') select(cursor() + 1);
  else if (e.key === 'ArrowUp') select(cursor() - 1);
  else if (e.key === 'Enter') { const l = items(); if (l.length > 0) run(l[Math.min(cursor(), l.length - 1)]); }
  else if (e.key === 'Escape') closePalette();
  else return;
  e.preventDefault();
}

/** Text with its matched characters highlighted: alternating plain / matched segments. */
function Highlighted(props: { text: string; hits: i32[]; color: i32; size: string }): i32 {
  const segs = segments(props.text, props.hits);
  return <View class="flex-row">
    {segs.map((s: string, i: i32) => <Text class={`${props.size} ${i % 2 === 1 ? `font-semibold ${fg(theme().accent)}` : fg(props.color)}`}>{s}</Text>)}
  </View>;
}

function Row(props: { it: Item }): i32 {
  const it = props.it;
  const on = (): boolean => items().indexOf(it) === cursor();
  return <View class={`flex-row items-center h-[30] px-2.5 gap-2 rounded-md cursor-pointer ${on() ? bg(theme().selected) : ''}`}
    onPointerDown={(e: ui.PointerEvent) => run(it)} onPointerEnter={(e: ui.PointerEvent) => setCursor(items().indexOf(it))}>
    {it.path !== '' && <Canvas style={{ width: 16, height: 16, lazy: 1 }}
      onDraw={(x: i32, y: i32, w: i32, h: i32) => drawFileIcon(it.label, false, false, x, y, w, theme())} />}
    <Highlighted text={it.label} hits={it.labelHits} color={theme().text} size="text-[13px]" />
    <Highlighted text={it.detail} hits={it.detailHits} color={theme().faint} size="text-[12px]" />
    <View class="grow" />
    {it.keys !== '' && <Kbd keys={it.keys} />}
  </View>;
}

/** Called when the palette opens: empty query, first row, the caret in the field. */
createEffect(() => {
  if (paletteMode() === PAL_CLOSED) return;
  setQuery(''); setCursor(0);
  if (listRef.node >= 0) ui.scrollTo(listRef.node, 0, 0);
  focusLater(inputRef.node);
});

export function Palette(): i32 {
  const t = (): number => paletteT.get();
  const n = (): i32 => Math.min(items().length, MAX_ROWS);
  return <View class="absolute inset-0 items-center pt-[64]" style={{ hidden: paletteMode() === PAL_CLOSED ? 1 : 0 }}>
    <View class="absolute inset-0" onPointerDown={() => closePalette()} />
    <View class={`flex-col w-[580] rounded-xl border shadow-xl overflow-hidden ${bg(theme().elevated)} ${bd(theme().border)}`}
      style={{ opacity: t(), scale: 0.96 + 0.04 * t(), translateX: (1 - (0.96 + 0.04 * t())) * 290, translateY: (1 - t()) * -8 }}
      onPointerDown={() => {}}>
      <View class={`flex-row items-center h-[42] px-3 border-b ${bd(theme().borderSoft)}`}>
        <Input ref={inputRef} class={`grow text-[14px] border-0 rounded-none bg-transparent p-0 ${fg(theme().text)} focus:${bd(theme().elevated)}`}
          placeholder={paletteMode() === PAL_FILES ? 'Search project files…' : 'Execute a command…'}
          value={query()} onInput={(v: string) => { setQuery(v); setCursor(0); if (listRef.node >= 0) ui.scrollTo(listRef.node, 0, 0); }}
          onKeyDown={paletteKey} />
      </View>
      <ScrollView ref={listRef} class="flex-col p-1" style={{ height: n() * ROW + 8 }}>
        {items().map((it: Item) => <Row it={it} />)}
      </ScrollView>
      {items().length === 0 && <View class="h-[40] px-4 justify-center">
        <Text class={`text-[13px] ${fg(theme().faint)}`}>No matches</Text>
      </View>}
    </View>
  </View>;
}
