// The palette (⌘⇧P): one floating list with a query field, for every command of the menu, and for the libraries (the
// plugins `zinc plugins` lists; Enter adds the import line to the sketch). Items are fuzzy-matched and the matched
// characters are drawn in the accent colour; ↑↓ choose, Enter runs, Esc closes. The panel fades and grows in (paletteT).
import { createSignal, createMemo, createNodeRef, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { COMMANDS, paletteMode, paletteT, closePalette, PAL_CLOSED, PAL_LIBRARIES, keysText, addLibrary } from '../app/commands';
import { focusLater } from '../app/workspace';
import { libraries } from '../app/tools';
import { fuzzy, segments, Fuzzy } from '../app/fuzzy';
import { noteKey } from '../app/cursors';
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
const ROW: i32 = 32, MAX_ROWS: i32 = 12, MAX_ITEMS: i32 = 80;

/** Items for the current mode and query, best first. */
const items = createMemo<Item[]>(() => {
  const mode = paletteMode(), q = query().trim();
  if (mode === PAL_CLOSED) return [];
  const out: Item[] = [];
  if (mode === PAL_LIBRARIES) {
    for (const l of libraries()) {
      const it = new Item(l.name, l.text.length > 84 ? l.text.slice(0, 82) + '…' : l.text, '', '', () => addLibrary(l.name));
      if (q !== '') {
        const m = fuzzy(q, l.name, 0);
        if (m === null) continue;
        it.score = (m as Fuzzy).score; it.labelHits = (m as Fuzzy).hits;
      }
      out.push(it);
    }
  } else {
    for (const c of COMMANDS) {
      const it = new Item(c.name, c.menu, keysText(c.keys), '', c.run);
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
  noteKey(e);
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
  return <View class={`flex-row items-center h-[32] px-3 gap-3 rounded-lg cursor-pointer ${on() ? bg(theme().selected) : ''}`}
    onPointerDown={(e: ui.PointerEvent) => run(it)} onPointerEnter={(e: ui.PointerEvent) => setCursor(items().indexOf(it))}>
    <Highlighted text={it.label} hits={it.labelHits} color={theme().text} size="text-[13px]" />
    <View class="grow shrink overflow-hidden h-[18]"><Text class={`text-[12px] ${fg(theme().faint)}`}>{it.detail}</Text></View>
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
  return <View class="absolute inset-0 items-center pt-[72]" style={{ hidden: paletteMode() === PAL_CLOSED ? 1 : 0 }}>
    <View class="absolute inset-0" onPointerDown={() => closePalette()} />
    <View class={`flex-col w-[620] rounded-2xl border shadow-xl overflow-hidden ${bg(theme().elevated)} ${bd(theme().border)}`}
      style={{ opacity: t(), scale: 0.96 + 0.04 * t(), translateX: (1 - (0.96 + 0.04 * t())) * 310, translateY: (1 - t()) * -8 }}
      onPointerDown={() => {}}>
      <View class={`flex-row items-center h-[46] px-4 border-b ${bd(theme().borderSoft)}`}>
        <Input ref={inputRef} class={`grow text-[14px] border-0 rounded-none bg-transparent p-0 ${fg(theme().text)} focus:${bd(theme().elevated)}`}
          placeholder={paletteMode() === PAL_LIBRARIES ? 'Add a library to the sketch…' : 'Do something…'}
          value={query()} onInput={(v: string) => { setQuery(v); setCursor(0); if (listRef.node >= 0) ui.scrollTo(listRef.node, 0, 0); }}
          onKeyDown={paletteKey} />
      </View>
      <ScrollView ref={listRef} class="flex-col p-1.5" style={{ height: n() * ROW + 12 }}>
        {items().map((it: Item) => <Row it={it} />)}
      </ScrollView>
      {items().length === 0 && <View class="h-[40] px-4 justify-center">
        <Text class={`text-[13px] ${fg(theme().faint)}`}>No matches</Text>
      </View>}
    </View>
  </View>;
}
