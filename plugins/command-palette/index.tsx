// zinc:command-palette: the command palette of Atelier and zed-editor. `fuzzy` matches a query in a text the way Zed's finder
// does (fuzzy.ts); `<Palette>` is the floating list with its query field: the app gives the rows for a query (built with
// `fuzzy`, best first), the palette keeps the query, the selected row and the scroll, draws the matched characters in the
// accent colour, and runs a row on Enter or a click (↑↓ choose, Esc closes). Colours come from zinc:editor's theme.
import { createSignal, createMemo, createNodeRef, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from 'zinc:editor';
import { segments } from './fuzzy';
export { Fuzzy, fuzzy, segments } from './fuzzy';

export class PaletteItem {
  label: string; detail: string; keys: string; path: string;
  labelHits: i32[] = []; detailHits: i32[] = []; score: number = 0;
  run: () => void;
  constructor(label: string, detail: string, keys: string, path: string, run: () => void) {
    this.label = label; this.detail = detail; this.keys = keys; this.path = path; this.run = run;
  }
}
/** Sorts rows best first when there is a query, and keeps the first `max`. */
export function ranked(out: PaletteItem[], query: string, max: i32): PaletteItem[] {
  if (query !== '') out.sort((a: PaletteItem, b: PaletteItem): number => b.score - a.score);
  return out.length > max ? out.slice(0, max) : out;
}

export interface PaletteProps {
  /** What the palette lists (-1: closed). A change resets the query and the selection. */
  mode: () => i32;
  /** 0 closed → 1 open: the panel fades and grows in with it. */
  progress: () => number;
  /** The rows for a query (trimmed), best first. */
  items: (query: string) => PaletteItem[];
  placeholder: () => string;
  empty: () => string;
  onClose: () => void;
  /** Gives the keyboard to a node at the next frame (after the press that opened the palette). */
  focus: (node: i32) => void;
  /** Sees every key of the field first (a desktop menu's key replay). */
  onKey?: (e: ui.KeyEvent) => void;
  /** The shortcut chip of a row. */
  kbd?: (keys: string) => i32;
  /** Draws the icon of a row that has a path (a file), in a size × size box. */
  icon?: (it: PaletteItem, x: i32, y: i32, size: i32) => void;
  /** Zed's denser look: 30 px rows, a 580 px panel. */
  dense?: boolean;
}

/** Text with its matched characters highlighted: alternating plain / matched segments. */
function Highlighted(props: { text: string; hits: i32[]; color: i32; size: string }): i32 {
  const segs = segments(props.text, props.hits);
  return <View className="flex-row">
    {segs.map((s: string, i: i32) => <Text className={`${props.size} ${i % 2 === 1 ? `font-semibold ${fg(theme().accent)}` : fg(props.color)}`}>{s}</Text>)}
  </View>;
}

export function Palette(props: PaletteProps): i32 {
  const dense = props.dense ?? false;
  const ROW: i32 = dense ? 30 : 32, MAX_ROWS: i32 = 12, W: i32 = dense ? 580 : 620;
  const [query, setQuery] = createSignal<string>('');
  const [cursor, setCursor] = createSignal<i32>(0);
  const inputRef = createNodeRef(), listRef = createNodeRef();
  const items = createMemo<PaletteItem[]>(() => props.mode() < 0 ? [] : props.items(query().trim()), []);
  const run = (it: PaletteItem): void => { props.onClose(); it.run(); };
  const select = (i: i32): void => {
    const n = items().length;
    if (n === 0) return;
    const k = ((i % n) + n) % n;
    setCursor(k);
    const sc = listRef.node;
    if (sc < 0) return;
    const top = ui.scrollTop(sc), y = k * ROW, h = Math.min(n, MAX_ROWS) * ROW;
    if (y < top) ui.scrollTo(sc, 0, y);
    else if (y + ROW > top + h) ui.scrollTo(sc, 0, y + ROW - h);
  };
  const onKey = props.onKey;
  const paletteKey = (e: ui.KeyEvent): void => {
    if (onKey !== undefined) (onKey as (e: ui.KeyEvent) => void)(e);
    if (e.key === 'ArrowDown') select(cursor() + 1);
    else if (e.key === 'ArrowUp') select(cursor() - 1);
    else if (e.key === 'Enter') { const l = items(); if (l.length > 0) run(l[Math.min(cursor(), l.length - 1)]); }
    else if (e.key === 'Escape') props.onClose();
    else return;
    e.preventDefault();
  };
  const icon = props.icon;
  const renderKbd = props.kbd ?? ((keys: string): i32 => <View className={`px-1.5 h-[20] rounded-md items-center justify-center border ${bd(theme().borderSoft)} ${bg(theme().chrome)}`}>
    <Text className={`text-[11px] ${fg(theme().muted)}`}>{keys}</Text>
  </View>);
  const row = (it: PaletteItem): i32 => {
    const on = (): boolean => items().indexOf(it) === cursor();
    return <View className={`flex-row items-center cursor-pointer ${dense ? 'h-[30] px-2.5 gap-2 rounded-md' : 'h-[32] px-3 gap-3 rounded-lg'} ${on() ? bg(theme().selected) : ''}`}
      onPointerDown={(e: ui.PointerEvent) => run(it)} onPointerEnter={(e: ui.PointerEvent) => setCursor(items().indexOf(it))}>
      {it.path !== '' && icon !== undefined && <Canvas style={{ width: 16, height: 16, lazy: 1 }}
        onDraw={(x: i32, y: i32, w: i32, h: i32) => (icon as (it: PaletteItem, x: i32, y: i32, size: i32) => void)(it, x, y, w)} />}
      <Highlighted text={it.label} hits={it.labelHits} color={theme().text} size="text-[13px]" />
      <View className="grow shrink overflow-hidden h-[18]"><Highlighted text={it.detail} hits={it.detailHits} color={theme().faint} size="text-[12px]" /></View>
      {it.keys !== '' && renderKbd(it.keys)}
    </View>;
  };
  // opening (or another list): empty query, first row, the caret in the field
  createEffect(() => {
    if (props.mode() < 0) return;
    setQuery(''); setCursor(0);
    if (listRef.node >= 0) ui.scrollTo(listRef.node, 0, 0);
    props.focus(inputRef.node);
  });
  const t = (): number => props.progress();
  const n = (): i32 => Math.min(items().length, MAX_ROWS);
  return <View className={`absolute inset-0 items-center ${dense ? 'pt-[64]' : 'pt-[72]'}`} style={{ hidden: props.mode() < 0 ? 1 : 0 }}>
    <View className="absolute inset-0" onPointerDown={() => props.onClose()} />
    <View className={`flex-col border shadow-xl overflow-hidden ${dense ? 'w-[580] rounded-xl' : 'w-[620] rounded-2xl'} ${bg(theme().elevated)} ${bd(theme().border)}`}
      style={{ opacity: t(), scale: 0.96 + 0.04 * t(), translateX: (1 - (0.96 + 0.04 * t())) * (W / 2), translateY: (1 - t()) * -8 }}
      onPointerDown={() => {}}>
      <View className={`flex-row items-center border-b ${dense ? 'h-[42] px-3' : 'h-[46] px-4'} ${bd(theme().borderSoft)}`}>
        <Input ref={inputRef} className={`border-slate-600 grow text-[14px] border-0 rounded-none bg-transparent p-0 ${fg(theme().text)} focus:${bd(theme().elevated)}`}
          placeholder={props.placeholder()}
          value={query()} onInput={(v: string) => { setQuery(v); setCursor(0); if (listRef.node >= 0) ui.scrollTo(listRef.node, 0, 0); }}
          onKeyDown={paletteKey} />
      </View>
      <ScrollView ref={listRef} className={`flex-col ${dense ? 'p-1' : 'p-1.5'}`} style={{ height: n() * ROW + (dense ? 8 : 12) }}>
        {items().map((it: PaletteItem) => row(it))}
      </ScrollView>
      {items().length === 0 && <View className="h-[40] px-4 justify-center">
        <Text className={`text-[13px] ${fg(theme().faint)}`}>{props.empty()}</Text>
      </View>}
    </View>
  </View>;
}
