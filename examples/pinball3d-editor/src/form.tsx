// The panel at the right: the properties of what is selected, as a form GENERATED from the format's schema. No field is named here:
// the kind of a field decides its control (a number with its limits and its unit, a switch, a choice among the words of an enum, a
// choice among the names of the table for a reference, a colour, a row of numbers, a curve for a height profile), its label comes
// from the string table and its help is the format's own line. A field added to the format shows here without a change.
// A schema of a hundred fields needs a way to one of them: the box at the top finds the fields of the selection by their name or
// their key (Cmd+F), and shows only those.
// The advanced mode shows the same fields by their keys in the file, and the selection as the file has it, which can be edited
// there (Cmd+J).
// A colour is picked, not typed: its swatch opens a square of shades, a strip of hues and the colours the table already uses.
// The forms read and write through a Source: the open table here, a schema kept with the test in formcheck.tsx.
import { createSignal, createNodeRef, createEffect, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rect, border, stroke, gradient } from 'zinc:gfx';
import { Schema, Field, Kind, Variants, Variant } from '../../pinball3d/src/format/schema';
import { doc, table, selected, select, setField, replaceSelected, deleteSelected, duplicateSelected, mirrorSelected, turnSelected, selectionTurns, selectionPlaced, advanced, setAdvanced, refresh,
  activeRow, setActiveRow, dragRow, changeRows, addTo, reorderSelected, addKind as addKindTo, setKind as setKindOf, removeItem, moveItem } from './state';
import { previewSound } from './play';
import { filesOfKind, noteOf, pictureOf, hearFile as hearFileOf, importFrom } from './files';
import { fieldAt, schemaAt, listOf, steps, pathOf, found, isPath, isProfile, colorsIn } from './doc';
import { rgb } from './shapes';
import { Ico, Action, Segmented, Chooser, Word, Menu, Picker, Switch, Heading, drawFitted, MUTED, ACCENT, chord } from './widgets';
import { Piece, pieces, sentenceOf, wordSaid, kindSaid, said, whenSaid, ruleSaid } from './sentences';
import * as L from './strings';
import { t, f, fieldName, listName, kindName, phrase } from './strings';

/** What a form shows and changes. */
export class Source {
  get(path: string): any { return undefined; }
  /** Whether the field holds its default (the way back to it is then not offered). */
  isDefault(path: string): boolean { return true; }
  /** The names a reference to this name space may hold. */
  names(space: string): string[] { return []; }
  set(path: string, value: any): void {}
  field(path: string): Field | null { return null; }
  /** One line that tells an item of a list from the others. */
  summary(path: string): string { return path; }
  /** Shows an item of a list in a form of its own. */
  open(path: string): void {}
  /** Adds an item to a list. */
  add(list: string): void {}
  /** Lets a sound be heard, by its name. */
  hear(name: string): void {}
  /** Sets a field as a handle being dragged does: the sets that follow one another are one step for undo, until seal(). */
  drag(path: string, value: any): void { this.set(path, value); }
  seal(): void {}
  /** The colours already in use, each once: the palette a colour is first looked for in. */
  colors(): string[] { return []; }
  /** The files of a kind ('image', 'sound', 'model') that can be named, by their names. */
  files(kind: string): string[] { return []; }
  /** A few words about a file (the size of an image, the length of a sound), and its picture when it is an image (-1: none). */
  fileNote(name: string): string { return ''; }
  filePicture(name: string): i32 { return -1; }
  /** Lets a sound file be heard. */
  hearFile(name: string): void {}
  /** Brings a file of a kind from elsewhere; the field at `path` then names it. */
  importFor(path: string, kind: string): void {}
  /** The schema of the object at a path; null when the source has none to give. */
  schemaOf(path: string): Schema | null { return null; }
  /** The names of the items of one list (and their groups): what a kind that speaks of that list may name. */
  among(list: string): string[] { return []; }
  /** Adds an object of one kind to a list whose items have kinds; makes the object at a path one of another kind. */
  addKind(list: string, word: string): void {}
  setKind(path: string, word: string): void {}
  /** Takes an item out of its list; moves it one place up (-1) or down (1). */
  remove(path: string): void {}
  move(path: string, by: i32): void {}
}
/** The open table. */
class TableSource extends Source {
  get(path: string): any { return doc().get(path); }
  isDefault(path: string): boolean { return doc().isDefault(path); }
  names(space: string): string[] { return doc().namesOf(space); }
  set(path: string, value: any): void { setField(path, value); }
  field(path: string): Field | null { return fieldAt(path); }
  summary(path: string): string { const s = sentenceAt(path); return s !== '' ? s : doc().summaryOf(path); }
  schemaOf(path: string): Schema | null { return schemaAt(path); }
  among(list: string): string[] { return doc().namesAmong(list); }
  addKind(list: string, word: string): void { addKindTo(list, word); }
  setKind(path: string, word: string): void { setKindOf(path, word); }
  remove(path: string): void { removeItem(path); }
  move(path: string, by: i32): void { moveItem(path, by); }
  open(path: string): void { select(path); }
  add(list: string): void { addTo(list); }
  hear(name: string): void { previewSound(name); }
  drag(path: string, value: any): void { dragRow(path, value); }
  seal(): void { doc().seal(); }
  colors(): string[] { return colorsIn(doc().data); }
  files(kind: string): string[] { return filesOfKind(kind); }
  fileNote(name: string): string { return noteOf(name); }
  filePicture(name: string): i32 { return pictureOf(name); }
  hearFile(name: string): void { hearFileOf(name); }
  importFor(path: string, kind: string): void { importFrom(kind, path); }
}
const TABLE = new TableSource();

const FIELD = 'h-7 px-2 rounded-md bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 focus:border-amber-400';
/** The width of a control that takes its whole place in a line. */
const WIDE = 160;

/** The field the help box explains: the one the pointer is over. */
const [helped, setHelped] = createSignal<string>('');

function shown(n: any): string { return typeof n === 'number' ? `${n}` : ''; }
/** A number as someone types it ("2,5" too); NaN when it is not one. */
function typed(v: string): number { return parseFloat(v.trim().replaceAll(',', '.')); }
function isNumber(n: number): boolean { return n - n === 0; }
function label(fd: Field): string { return advanced() ? fd.name : fieldName(fd.name); }
/** A unit of the format as it is written beside a number: "degrees" gives "°". */
export function unitName(unit: string): string {
  return unit.replaceAll('degrees', '°').replaceAll('per second', '/s').replaceAll('seconds', 's').replaceAll('grams', 'g').replaceAll('s2', 's²');
}
function Unit(p: { of: Field }): i32 { return <text class="text-[11px] text-zinc-500">{unitName(p.of.unit)}</text>; }

/** One line of the form: the label, the control, and the way back to the default when the field holds something else. */
function Row(p: { src: Source; field: Field; path: string; children: () => i32 }): i32 {
  const changed = (): boolean => !p.field.required && p.src.get(p.path) !== undefined && !p.src.isDefault(p.path);
  return <view class="flex-row items-center gap-2 px-4 hover:bg-zinc-800" style={{ minHeight: 32 }} onPointerEnter={(e: ui.PointerEvent) => setHelped(p.path)}>
    <text class={`w-[112] shrink-0 truncate text-xs ${advanced() ? 'font-mono text-zinc-300' : 'text-zinc-400'}`}>{label(p.field)}</text>
    <view class="grow basis-0 min-w-0 flex-row items-center gap-[6]">{p.children()}</view>
    <button class={`w-[20] h-[20] items-center justify-center rounded cursor-pointer bg-transparent hover:bg-zinc-700 ${changed() ? '' : 'opacity-0'}`} tabIndex={-1}
      onClick={() => { if (changed()) p.src.set(p.path, p.field.def); }}>
      <Ico name="rotate-ccw" size={11} color={MUTED} />
    </button>
  </view>;
}
/** A row of numbers: a point, a size, a box. Each number is set alone; the row is written whole. */
function TupleBoxes(p: { src: Source; field: Field; path: string }): i32 {
  const cells: i32[] = [];
  for (let i = 0; i < p.field.cols; i++) cells.push(i);
  return <view class="flex-row items-center gap-1">
    {cells.map((i: i32, k: i32) => <input class={FIELD} style={{ width: p.field.cols > 3 ? 38 : p.field.cols > 2 ? 46 : 56 }} value={shown(p.src.get(`${p.path}[${i}]`))}
      onChange={(v: string) => {
        const n = typed(v), row: any = p.src.get(p.path), next: number[] = [];
        if (!isNumber(n)) { refresh(); return; }
        for (let c = 0; c < row.length; c++) { const old: number = row[c]; next.push(c === i ? n : old); }
        p.src.set(p.path, next);
      }} />)}
  </view>;
}
/** A reference: one of the names the table has for it, or none. */
function Names(p: { src: Source; field: Field; path: string }): i32 {
  const src = p.src, fd = p.field, path = p.path;
  const text = (): string => { const v: any = src.get(path); return typeof v === 'string' ? `${v}` : ''; };
  return <Chooser value={text} options={() => fd.required ? src.names(fd.to) : [''].concat(src.names(fd.to))} label={(v: string) => v === '' ? t(L.NONE) : v} onPick={(v: string) => { src.set(path, v); }} />;
}
/** A colour as its hue (0 to 360), how vivid it is and how light (both 0 to 1). */
function hsvOf(hex: string): number[] {
  const c = hex.length === 7 ? rgb(hex) : 0, r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const max = Math.max(r, Math.max(g, b)), d = max - Math.min(r, Math.min(g, b));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max === 0 ? 0 : d / max, max];
}
function shade(h: number, s: number, v: number): i32 {
  const part = (n: number): i32 => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, Math.min(4 - k, 1)))) * 255); };
  return (part(5) << 16) | (part(3) << 8) | part(1);
}
const HEX = '0123456789abcdef';
function hexOf(c: i32): string {
  let out = '#';
  for (let k = 20; k >= 0; k -= 4) out += HEX.charAt((c >> k) & 15);
  return out;
}
/** A colour: its swatch opens a square of the shades of a hue (more vivid to the right, darker downwards), the strip of the hues,
 *  and the colours the table already uses; the text beside it still takes a colour typed or pasted. A drag across the square is
 *  one step for undo. */
function ColorField(p: { src: Source; path: string }): i32 {
  const src = p.src, path = p.path, W = 220, H = 120, STRIP = 14;
  const text = (): string => { const v: any = src.get(path); return typeof v === 'string' ? `${v}` : ''; };
  const swatch = createNodeRef(), pop = createNodeRef();
  const [open, setOpen] = createSignal<boolean>(false);
  // the hue is kept apart from the colour: a grey has none of its own, and the square must not change under the pointer
  const [hue, setHue] = createSignal<number>(0);
  let grab = 0;
  const close = (): void => { if (open()) { setOpen(false); ui.setNumber(pop.node, 'hidden', 1); } };
  const toggle = (): void => {
    if (open()) { close(); return; }
    setHue(hsvOf(text())[0]);
    setOpen(true);
    ui.setNumber(pop.node, 'hidden', 0);
  };
  const within = (v: number): number => Math.max(0, Math.min(1, v));
  const shadeAt = (e: ui.PointerEvent): void => { src.drag(path, hexOf(shade(hue(), within(e.x / W), within(1 - e.y / H)))); };
  const hueAt = (e: ui.PointerEvent): void => {
    const now = hsvOf(text()), h = within(e.x / W) * 359;
    setHue(h);
    // a grey or a black would stay what it is under any hue: it is given some colour to show the hue picked
    src.drag(path, hexOf(shade(h, now[1] < 0.05 ? 0.8 : now[1], now[2] < 0.05 ? 0.8 : now[2])));
  };
  createEffect(() => { text(); hue(); open(); ui.repaint(); });
  const node = <view class="flex-row items-center gap-2">
    <button ref={swatch} class="w-[24] h-[24] rounded border border-zinc-600 cursor-pointer" style={{ bg: text().length === 7 ? rgb(text()) : 0 }} tabIndex={-1} onClick={toggle} />
    <input class={`font-mono ${FIELD}`} style={{ width: 84 }} value={text()} onChange={(v: string) => { src.set(path, v.trim().toLowerCase()); }} />
    <view ref={pop} hidden={1} class="flex-col gap-2 p-2 rounded-md bg-zinc-900 border border-zinc-600 shadow-lg" style={{ width: W + 18 }}>
      <view class="relative rounded overflow-hidden cursor-crosshair" style={{ width: W, height: H }}
        onPointerDown={(e: ui.PointerEvent) => { grab = 1; src.seal(); shadeAt(e); }} onPointerMove={(e: ui.PointerEvent) => { if (grab === 1) shadeAt(e); }} onPointerUp={(e: ui.PointerEvent) => { grab = 0; src.seal(); }}>
        <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          for (let c = 0; c < W; c += 4) gradient(x + c, y, 4, H, 0, shade(hue(), (c + 2) / W, 1), 0x000000, true, 255);
          const now = hsvOf(text()), mx = Math.round(x + now[1] * W), my = Math.round(y + (1 - now[2]) * H);
          border(mx - 5, my - 5, 10, 10, 5, 2, 0xffffff, 255);
          border(mx - 6, my - 6, 12, 12, 6, 1, 0x000000, 255);
        }} />
      </view>
      <view class="relative rounded overflow-hidden cursor-crosshair" style={{ width: W, height: STRIP }}
        onPointerDown={(e: ui.PointerEvent) => { grab = 2; src.seal(); hueAt(e); }} onPointerMove={(e: ui.PointerEvent) => { if (grab === 2) hueAt(e); }} onPointerUp={(e: ui.PointerEvent) => { grab = 0; src.seal(); }}>
        <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          const part = W / 6;
          for (let k = 0; k < 6; k++) gradient(Math.round(x + k * part), y, Math.ceil(part), STRIP, 0, shade(k * 60, 1, 1), shade(k * 60 + 60, 1, 1), false, 255);
          const mx = Math.round(x + hue() / 359 * W);
          rect(mx - 2, y, 4, STRIP, 0x000000);
          rect(mx - 1, y, 2, STRIP, 0xffffff);
        }} />
      </view>
      <Heading label={t(L.COLOURS_IN_USE)} />
      <view class="flex-row flex-wrap gap-1" style={{ width: W }}>
        <For each={src.colors().slice(0, 40)}>{(c: string, i: i32) => <button class="w-[18] h-[18] rounded border border-zinc-700 cursor-pointer" style={{ bg: rgb(c) }} tabIndex={-1}
          onClick={() => { src.seal(); src.set(path, c); setHue(hsvOf(c)[0]); }} />}</For>
      </view>
    </view>
  </view>;
  ui.openLayer(pop.node, { priority: 100 });
  ui.anchor(pop.node, swatch.node, 'bottom-start', 2);
  ui.onDismiss(pop.node, close);
  ui.onOutsidePointer(pop.node, (e: ui.PointerEvent) => close(), swatch.node);
  return node;
}
/** What stands in the list of a file field for bringing a file from elsewhere. */
const IMPORT = '+import';
/** A file of the table's folder: one of those of the field's kind, each with what tells it from the others, or a file brought
 *  from elsewhere. Under the choice, the picture of the image it names, and what is known of the file. */
function FileField(p: { src: Source; field: Field; path: string }): i32 {
  const src = p.src, path = p.path, kind = p.field.to;
  const text = (): string => { const v: any = src.get(path); return typeof v === 'string' ? `${v}` : ''; };
  const real = (v: string): boolean => v !== '' && v !== IMPORT;
  const options = (): string[] => {
    const all = src.files(kind), out: string[] = [''];
    for (const name of all) out.push(name);
    if (text() !== '' && all.indexOf(text()) < 0) out.push(text());   // a file the table names and the folder lacks is still shown
    out.push(IMPORT);
    return out;
  };
  return <view class="flex-col gap-1 py-1" style={{ width: WIDE }}>
    <view class="flex-row items-center gap-1">
      <view style={{ width: kind === 'sound' ? WIDE - 30 : WIDE }}>
        <Picker value={text} options={options} label={(v: string) => v === '' ? t(L.NONE) : v === IMPORT ? t(L.IMPORT) : v} picture={(v: string) => real(v) ? src.filePicture(v) : -1}
          note={(v: string) => real(v) ? src.fileNote(v) : ''} search={true} width={300} look="field" title="" onPick={(v: string) => { if (v === IMPORT) src.importFor(path, kind); else src.set(path, v); }} />
      </view>
      <Show when={kind === 'sound'}>
        <button class={`w-[26] h-[26] items-center justify-center rounded-md cursor-pointer bg-zinc-800 hover:bg-zinc-700 ${text() === '' ? 'opacity-40' : ''}`} tabIndex={-1} onClick={() => { if (text() !== '') src.hearFile(text()); }}>
          <Ico name="play" size={12} color={ACCENT} />
        </button>
      </Show>
    </view>
    <Show when={text() !== ''}>
      <view class="flex-row items-center gap-2">
        <Show when={src.filePicture(text()) >= 0}>
          <canvas class="shrink-0 rounded border border-zinc-700" style={{ width: 44, height: 44, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawFitted(src.filePicture(text()), x, y, w, h)} />
        </Show>
        <text class="text-[10px] text-zinc-500">{src.fileNote(text())}</text>
      </view>
    </Show>
  </view>;
}
// ---------------------------------------------------------------- objects that are of a kind: conditions, actions
// The format says what each kind reads (the variants of the schema). A part of such an object is then never typed as the file has
// it: its kind is chosen among the kinds, its target among what the table has for that kind (or its words, or a text when the kind
// takes any), its way among the ways of the kind. Choosing a kind gives a whole object at once (state.ts setKind, presets.ts startOf).

/** The object a field belongs to: "rules.when[3].do[0].target" gives "rules.when[3].do[0]". */
function ownerOf(path: string): string { const cut = path.lastIndexOf('.'); return cut < 0 ? '' : path.slice(0, cut); }
/** The variants of the object a field belongs to; null when it has none, or in the advanced mode (which shows the file's fields). */
function variantsFor(src: Source, path: string): Variants | null {
  if (advanced()) return null;
  const s = src.schemaOf(ownerOf(path));
  return s === null ? null : s.variants;
}
/** One part of an object that is of a kind. `slot`: the name of its field (the kind, the target, the way, a number), or "target"
 *  and "way" as a sentence names them, or '' for a plain word of the sentence (`said`); `inline`: as a word of a sentence, else as
 *  the control of a line of a form. */
function Part(p: { src: Source; schema: Schema; item: string; slot: string; said: string; inline: boolean }): i32 {
  const src = p.src, s = p.schema, item = p.item, vs = s.variants as Variants;
  if (p.slot === '') return <text class="text-xs text-zinc-300">{p.said}</text>;
  const kind = (): string => `${src.get(`${item}.${vs.kind}`)}`;
  if (p.slot === vs.kind) {
    const kinds = (): string[] => vs.all.map((v: Variant) => v.word), said = (w: string): string => kindSaid(s.name, w), pick = (w: string): void => { src.setKind(item, w); };
    return p.inline ? <Word value={kind} options={kinds} label={said} onPick={pick} /> : <view style={{ width: WIDE }}><Chooser value={kind} options={kinds} label={said} onPick={pick} /></view>;
  }
  const aims = p.slot === 'target' || p.slot === vs.target, ways = p.slot === 'way' || p.slot === vs.way;
  if (!aims && !ways) {
    const at = `${item}.${p.slot}`;
    return <input class={FIELD} style={{ width: p.inline ? 62 : 84 }} value={shown(src.get(at))} onChange={(x: string) => { const n = typed(x); if (isNumber(n)) src.set(at, n); else refresh(); }} />;
  }
  const path = `${item}.${aims ? vs.target : vs.way}`;
  const text = (): string => { const x: any = src.get(path); return typeof x === 'string' ? `${x}` : ''; };
  const pick = (x: string): void => { src.set(path, x); };
  // what a target or a way offers depends on the kind: the control is made again when the kind changes
  return <view class="flex-row items-center">
    <For each={[kind()]}>{(word: string, i: i32) => {
      const v = vs.of(word);
      if (v === null || (aims ? !v.aimed : v.ways.length === 0)) return <text class="text-xs text-zinc-600">{t(L.NOT_READ)}</text>;
      const kindOf: Variant = v;
      if (ways) {
        const options = (): string[] => kindOf.ways, label = (x: string): string => wordSaid(s.name, word, x);
        return p.inline ? <Word value={text} options={options} label={label} onPick={pick} /> : <view style={{ width: WIDE }}><Chooser value={text} options={options} label={label} onPick={pick} /></view>;
      }
      if (kindOf.names === '' && kindOf.words.length === 0) return <input class={FIELD} style={{ width: p.inline ? 168 : WIDE }} value={text()} onChange={(x: string) => { src.set(path, x); }} />;
      const options = (): string[] => kindOf.words.concat(kindOf.among !== '' ? src.among(kindOf.among) : kindOf.names === '' ? [] : src.names(kindOf.names));
      const label = (x: string): string => kindOf.words.indexOf(x) >= 0 ? wordSaid(s.name, word, x) : x;
      const heard = kindOf.names === 'sounds';
      return <view class="flex-row items-center gap-1">
        {p.inline ? <Word value={text} options={options} label={label} onPick={pick} /> : <view style={{ width: heard ? WIDE - 30 : WIDE }}><Chooser value={text} options={options} label={label} onPick={pick} /></view>}
        {heard ? <button class="w-[24] h-[24] items-center justify-center rounded-md cursor-pointer bg-zinc-800 hover:bg-zinc-700" tabIndex={-1} onClick={() => { if (text() !== '') src.hear(text()); }}>
          <Ico name="play" size={11} color={ACCENT} />
        </button> : <view />}
      </view>;
    }}</For>
  </view>;
}
/** An object that is of a kind, as the sentence a person would say: its words, and each part at the place the language puts it,
 *  as a choice or a number. */
function Sentence(p: { src: Source; schema: Schema; item: string; width: number }): i32 {
  const src = p.src, s = p.schema, item = p.item, vs = s.variants as Variants;
  // the sentence is laid out again when the kind or the way gives another one; its parts follow the table by themselves
  const shape = (): string => {
    const word = `${src.get(`${item}.${vs.kind}`)}`, v = vs.of(word);
    return v === null ? '' : `${word}|${sentenceOf(s.name, v, `${src.get(`${item}.${vs.way}`)}`)}`;
  };
  return <view class="flex-col" style={{ width: p.width }}>
    <For each={[shape()]}>{(key: string, i: i32) => {
      // one node per word, so that a long sentence goes on to the next line between two words
      const parts: Piece[] = [];
      for (const piece of pieces(key.slice(key.indexOf('|') + 1))) {
        if (piece.slot !== '') { parts.push(piece); continue; }
        for (const w of piece.text.split(' ')) if (w.length > 0) parts.push(new Piece(w, ''));
      }
      return <view class="flex-row flex-wrap items-center gap-1" style={{ width: p.width, minHeight: 24 }}>
        {parts.map((piece: Piece, k: i32) => <Part src={src} schema={s} item={item} slot={piece.slot} said={piece.text} inline={true} />)}
      </view>;
    }}</For>
  </view>;
}
/** A list of objects that are of a kind (the conditions and the actions of a rule): each as its sentence, with the ways to make it
 *  another kind, to move it and to take it away; the button at the top adds one, of the kind chosen in its list. */
function Guided(p: { src: Source; field: Field; path: string }): i32 {
  const src = p.src, of = p.field.of as Schema, vs = of.variants as Variants, small = 'w-[20] h-[20] items-center justify-center rounded cursor-pointer bg-transparent hover:bg-zinc-700';
  const count = (): i32 => { const v: any = src.get(p.path); return v === undefined ? 0 : v.length; };
  const places = (): string[] => { const out: string[] = []; for (let i = 0; i < count(); i++) out.push(`${i}`); return out; };
  const kinds = (): string[] => vs.all.map((v: Variant) => v.word), kindSays = (w: string): string => kindSaid(of.name, w);
  const none = (): string => { const own = phrase(`empty.${p.field.name}`); return own === '' ? t(L.NONE) : own; };
  return <view class="flex-col mt-2" onPointerEnter={(e: ui.PointerEvent) => setHelped(p.path)}>
    <view class="flex-row items-center gap-2 px-4 h-7">
      <Heading label={label(p.field)} />
      <text class="text-[11px] text-zinc-600">{`${count()}`}</text>
      <view class="grow" />
      <Menu icon="plus" title={t(L.ADD)} options={kinds} label={kindSays} onPick={(w: string) => { src.addKind(p.path, w); }} />
    </view>
    <Show when={count() === 0}><text class="px-4 py-1 text-[11px] text-zinc-500" style={{ width: 340 }}>{none()}</text></Show>
    <view class="flex-col gap-1 px-4 pt-1">
      <For each={places()}>{(at: string, i: i32) => {
        const item = `${p.path}[${at}]`;
        return <view class="flex-row items-start gap-1 pl-2 pr-1 py-1 rounded-md bg-zinc-950 border border-zinc-800">
          <Sentence src={src} schema={of} item={item} width={226} />
          <view class="flex-row items-center shrink-0" style={{ height: 24 }}>
            <Menu icon="repeat" title="" options={kinds} label={kindSays} onPick={(w: string) => { src.setKind(item, w); }} />
            <button class={small} tabIndex={-1} onClick={() => { src.move(item, -1); }}><Ico name="arrow-up" size={11} color={MUTED} /></button>
            <button class={small} tabIndex={-1} onClick={() => { src.remove(item); }}><Ico name="x" size={11} color={MUTED} /></button>
          </view>
        </view>;
      }}</For>
    </view>
  </view>;
}
/** The object at a path of the open table as a sentence: an object that is of a kind, or one that holds lists of such objects (a
 *  rule); '' for anything else, and in the advanced mode. */
function sentenceAt(path: string): string {
  if (advanced()) return '';
  const s = schemaAt(path), v: any = doc().get(path);
  if (v === undefined || v === null || path === '') return '';
  if (s.variants !== null) return said(s, v);
  for (const fd of s.fields) if (fd.kind === Kind.List && fd.of !== null && (fd.of as Schema).variants !== null) return ruleSaid(s, v);
  return '';
}

function Control(p: { src: Source; field: Field; path: string }): i32 {
  const fd = p.field, path = p.path, src = p.src;
  // a part of an object that is of a kind: its choices are those of the kind
  const vs = variantsFor(src, path);
  if (vs !== null && (fd.name === vs.kind || fd.name === vs.target || fd.name === vs.way)) return <Part src={src} schema={src.schemaOf(ownerOf(path)) as Schema} item={ownerOf(path)} slot={fd.name} said="" inline={false} />;
  const text = (): string => { const v: any = src.get(path); return typeof v === 'string' ? `${v}` : ''; };
  const count = (): string => { const v: any = src.get(path); return v === undefined ? '0' : `${v.length}`; };
  if (fd.kind === Kind.Num || fd.kind === Kind.Int) return <view class="flex-row items-center gap-[6]">
    <input class={FIELD} style={{ width: 84 }} value={shown(src.get(path))} onChange={(v: string) => { const n = typed(v); if (isNumber(n)) src.set(path, n); else refresh(); }} />
    <Unit of={fd} />
  </view>;
  if (fd.kind === Kind.Bool) return <Switch value={() => src.get(path) === true} yes={t(L.YES)} no={t(L.NO)} onPick={(v: boolean) => { src.set(path, v); }} />;
  if (fd.kind === Kind.Color) return <ColorField src={src} path={path} />;
  if (fd.kind === Kind.Choice) {
    const said = (c: string): string => c === '' ? t(L.NONE) : c;
    if (fd.choices.length <= 3 && fd.choices.join('').length < 22) return <view style={{ width: WIDE }}><Segmented options={fd.choices} labels={fd.choices.map((c: string) => said(c))} value={text} onPick={(v: string) => { src.set(path, v); }} /></view>;
    return <view style={{ width: WIDE }}><Chooser value={text} options={() => fd.choices} label={said} onPick={(v: string) => { src.set(path, v); }} /></view>;
  }
  if (fd.kind === Kind.Ref) {
    if (fd.to !== 'sounds') return <view style={{ width: WIDE }}><Names src={src} field={fd} path={path} /></view>;
    // the name of a sound: it can be heard
    return <view class="flex-row items-center gap-1" style={{ width: WIDE }}>
      <view style={{ width: WIDE - 30 }}><Names src={src} field={fd} path={path} /></view>
      <button class={`w-[26] h-[26] items-center justify-center rounded-md cursor-pointer bg-zinc-800 hover:bg-zinc-700 ${text() === '' ? 'opacity-40' : ''}`} tabIndex={-1} onClick={() => { if (text() !== '') src.hear(text()); }}>
        <Ico name="play" size={12} color={ACCENT} />
      </button>
    </view>;
  }
  if (fd.kind === Kind.Asset) return <FileField src={src} field={fd} path={path} />;
  if (fd.kind === Kind.Tuple) return <view class="flex-row items-center gap-[6]"><TupleBoxes src={src} field={fd} path={path} /><Unit of={fd} /></view>;
  if (fd.kind === Kind.Rows) return <text class="text-xs text-zinc-500">{f(isPath(fd) ? L.POINTS : L.ROWS, count())}</text>;
  if (fd.kind === Kind.List) return <text class="text-xs text-zinc-500">{f(L.ITEMS, count())}</text>;
  if (fd.kind === Kind.Texts) {
    const lines = (): string => { const v: any = src.get(path); const out: string[] = []; if (v !== undefined) for (let i = 0; i < v.length; i++) out.push(`${v[i]}`); return out.join('\n'); };
    return <textarea class="p-2 rounded-md bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 focus:border-amber-400" style={{ width: WIDE }} rows={4} placeholder={t(L.ONE_PER_LINE)} value={lines()}
      onChange={(v: string) => { src.set(path, v.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0)); }} />;
  }
  return <input class={FIELD} style={{ width: WIDE }} value={text()} onChange={(v: string) => { src.set(path, v); }} />;
}
/** A list of objects inside a form (the rules, the steps of a mission, the actions of a rule): a line per item, which says what the
 *  item is and opens its own form, and a way to add one. */
function Items(p: { src: Source; field: Field; path: string }): i32 {
  // "3 pops hit [score 500]": the place of an item and what tells it from the others; the lines are made again when either changes
  const rows = (): string[] => {
    const v: any = p.src.get(p.path), out: string[] = [];
    if (v !== undefined) for (let i = 0; i < v.length; i++) out.push(`${i} ${p.src.summary(`${p.path}[${i}]`)}`);
    return out;
  };
  return <view class="flex-col mt-2" onPointerEnter={(e: ui.PointerEvent) => setHelped(p.path)}>
    <view class="flex-row items-center gap-2 px-4 h-7">
      <Heading label={label(p.field)} />
      <text class="text-[11px] text-zinc-600">{`${rows().length}`}</text>
    </view>
    <view class="flex-col gap-[2] px-4">
      <For each={rows()}>{(row: string, i: i32) => {
        const cut = row.indexOf(' '), at = row.slice(0, cut);
        // a line that is a sentence (a rule) is shown whole, on as many lines as it takes
        return <button class="flex-row items-center justify-start gap-2 px-2 py-[6] rounded-md cursor-pointer bg-zinc-950 border border-zinc-800 hover:border-zinc-600" onClick={() => p.src.open(`${p.path}[${at}]`)}>
          <text class="w-[18] shrink-0 text-right text-[11px] text-zinc-600">{`${parseInt(at, 10) + 1}`}</text>
          <text class="grow basis-0 text-left text-xs text-zinc-200" style={{ width: 236 }}>{row.slice(cut + 1)}</text>
          <Ico name="chevron-right" size={12} color={MUTED} />
        </button>;
      }}</For>
      <button class="flex-row items-center justify-center gap-[6] h-7 px-2 rounded-md cursor-pointer bg-zinc-900 border border-zinc-700 hover:bg-zinc-800" onClick={() => p.src.add(p.path)}>
        <Ico name="plus" size={12} color={MUTED} />
        <text class="text-xs font-bold text-zinc-300">{t(L.ADD)}</text>
      </button>
    </view>
  </view>;
}
/** A height profile of the table as a curve to shape: the height (up) along the path (from its start at the left to its end at the right). A
 *  point is dragged; a double click adds one; the first and the last stay at the two ends of the path. */
function ProfileChart(p: { path: string }): i32 {
  const W = 308, H = 112, PAD = 12;
  let grabbed: i32 = -1;
  const glass = (): number => table().playfield.glass;
  const count = (): i32 => { const v: any = doc().get(p.path); return v === undefined ? 0 : v.length; };
  const at = (i: i32, k: i32): number => { const v: number = doc().get(p.path)[i][k]; return v; };
  const px = (fraction: number): number => PAD + fraction * (W - 2 * PAD), py = (height: number): number => H - PAD - height / glass() * (H - 2 * PAD);
  // where the pointer says a point is: hundredths of the path, millimetres of height
  const fractionAt = (x: number): number => Math.round(Math.max(0, Math.min(1, (x - PAD) / (W - 2 * PAD))) * 100) / 100;
  const heightAt = (y: number): number => Math.round(Math.max(0, Math.min(glass(), (H - PAD - y) / (H - 2 * PAD) * glass())) * 10) / 10;
  createEffect(() => { doc(); activeRow(); ui.repaint(); });
  return <view class="flex-col gap-1 px-4 py-2" onPointerEnter={(e: ui.PointerEvent) => setHelped(p.path)}>
    <view class="relative rounded-md bg-zinc-950 border border-zinc-700 overflow-hidden cursor-crosshair" style={{ width: W, height: H }}
      onPointerDown={(e: ui.PointerEvent) => {
        grabbed = -1;
        for (let i = 0; i < count(); i++) if (Math.abs(px(at(i, 0)) - e.x) < 8 && Math.abs(py(at(i, 1)) - e.y) < 8) grabbed = i;
        doc().seal();
        setActiveRow(grabbed < 0 ? '' : `${p.path}[${grabbed}]`);
      }}
      onPointerMove={(e: ui.PointerEvent) => {
        if (grabbed < 0 || grabbed >= count()) return;
        // the ends of the path are the first and the last point; the others stay between their neighbours
        const n = count(), fraction = grabbed === 0 ? 0 : grabbed === n - 1 ? 1 : Math.max(at(grabbed - 1, 0) + 0.01, Math.min(at(grabbed + 1, 0) - 0.01, fractionAt(e.x)));
        dragRow(`${p.path}[${grabbed}]`, [Math.round(fraction * 100) / 100, heightAt(e.y)]);
      }}
      onPointerUp={(e: ui.PointerEvent) => { grabbed = -1; doc().seal(); }}
      onDoubleClick={(e: ui.PointerEvent) => {
        const fraction = fractionAt(e.x);
        let place: i32 = -1;
        for (let i = 1; i < count(); i++) if (place < 0 && fraction > at(i - 1, 0) && fraction < at(i, 0)) place = i;
        grabbed = -1;
        if (place > 0 && changeRows(p.path, place, [fraction, heightAt(e.y)])) setActiveRow(`${p.path}[${place}]`);
      }}>
      <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
        const n = count(), pts: number[] = [], top = glass();
        for (let g = 0; g <= top; g += 5) rect(x + PAD, Math.round(y + py(g)), W - 2 * PAD, 1, g === 0 ? 0x52525b : 0x27272a);
        for (let i = 0; i < n; i++) { pts.push(x + px(at(i, 0))); pts.push(y + py(at(i, 1))); }
        if (n > 1) stroke(pts, 2.5, ACCENT, 255, false);
        for (let i = 0; i < n; i++) {
          const cx = Math.round(pts[i * 2]), cy = Math.round(pts[i * 2 + 1]);
          rect(cx - 5, cy - 5, 10, 10, 0x18181b);
          rect(cx - 4, cy - 4, 8, 8, activeRow() === `${p.path}[${i}]` ? ACCENT : 0xfafafa);
        }
      }} />
    </view>
    <view class="flex-row" style={{ width: W }}>
      <text class="text-[10px] text-zinc-500">{t(L.START)}</text>
      <view class="grow" />
      <text class="text-[10px] text-zinc-500">{`0 – ${glass()} ${t(L.CM)}`}</text>
      <view class="grow" />
      <text class="text-[10px] text-zinc-500">{t(L.END)}</text>
    </view>
    <text class="text-[11px] text-zinc-500" style={{ width: W }}>{t(L.PROFILE_HOW)}</text>
  </view>;
}
/** One field of a form: an object of the format is a heading and its own fields under it, a height profile a curve, anything else a
 *  line. */
function Entry(p: { src: Source; field: Field; path: string }): i32 {
  const fd = p.field;
  if (isProfile(fd)) return <view class="flex-col"><Row src={p.src} field={fd} path={p.path}><Control src={p.src} field={fd} path={p.path} /></Row><ProfileChart path={p.path} /></view>;
  if (isPath(fd)) return <view class="flex-col">
    <Row src={p.src} field={fd} path={p.path}><Control src={p.src} field={fd} path={p.path} /></Row>
    <text class="px-4 pb-2 text-[11px] text-zinc-500" style={{ width: 340 }}>{t(L.PATH_HINT)}</text>
  </view>;
  // a list of objects that are of a kind is its sentences (the advanced mode keeps the lines that open each object's fields)
  if (fd.kind === Kind.List && !advanced() && fd.of !== null && (fd.of as Schema).variants !== null) return <Guided src={p.src} field={fd} path={p.path} />;
  if (fd.kind === Kind.List) return <Items src={p.src} field={fd} path={p.path} />;
  if (fd.kind !== Kind.Obj) return <Row src={p.src} field={fd} path={p.path}><Control src={p.src} field={fd} path={p.path} /></Row>;
  return <view class="flex-col mt-2">
    <view class="flex-row items-center px-4 h-7" onPointerEnter={(e: ui.PointerEvent) => setHelped(p.path)}><Heading label={label(fd)} /></view>
    <view class="flex-col ml-4 border-l border-zinc-800"><Fields src={p.src} schema={fd.of as Schema} path={p.path} whole={true} /></view>
  </view>;
}
/** What a form leaves out: what the file fixes for every table (a choice of one word), the version outside the advanced mode. */
function offered(fd: Field, path: string): boolean { return !(fd.kind === Kind.Choice && fd.choices.length === 1) && (advanced() || fd.name !== 'version' || path !== ''); }
/** The fields of an object, in the order of the format. `whole`: with its objects and lists (false for the table itself, whose parts
 *  are the lines of the list at the left). */
export function Fields(p: { src: Source; schema: Schema; path: string; whole: boolean }): i32 {
  const at = (fd: Field): string => p.path === '' ? fd.name : `${p.path}.${fd.name}`;
  const fields = p.schema.fields.filter((fd: Field) => offered(fd, p.path) && (p.whole || (fd.kind !== Kind.Obj && fd.kind !== Kind.List)));
  return <view class="flex-col">{fields.map((fd: Field, i: i32) => <Entry src={p.src} field={fd} path={at(fd)} />)}</view>;
}

// ---------------------------------------------------------------- finding a field

/** What is typed in the box that finds a field. */
export const [wanted, setWanted] = createSignal<string>('');
const finder = createNodeRef();
/** Puts the caret in the box that finds a field (Cmd+F). */
export function findField(): void { if (finder.node >= 0) { ui.focusNode(finder.node); ui.select(finder.node, 0, ui.getValue(finder.node).length); } }
function Finder(): i32 {
  return <view class="flex-row items-center gap-2 h-10 px-3 shrink-0 border-b border-zinc-800">
    <Ico name="search" size={13} color={MUTED} />
    <input ref={finder} style={{ width: 288 }} class="h-7 px-2 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-amber-400" placeholder={f(L.FIND_FIELD, chord('F'))} value={wanted()}
      onInput={(v: string) => setWanted(v)} onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Escape') setWanted(''); }} />
  </view>;
}

/** What the format says of the field the pointer is over: its line of help, its limits, its default, and its key in the file. */
export function Help(p: { src: Source }): i32 {
  const fd = (): Field | null => helped() === '' ? null : p.src.field(helped());
  const limits = (): string => {
    const x = fd();
    if (x === null || (x.kind !== Kind.Num && x.kind !== Kind.Int)) return '';
    const unit = x.unit === '' ? '' : ` ${unitName(x.unit)}`;
    if (x.min > -1e300 && x.max < 1e300) return f(L.LIMITS, `${x.min}`, `${x.max}${unit}`);
    return x.min > -1e300 ? f(L.AT_LEAST, `${x.min}${unit}`) : x.max < 1e300 ? f(L.AT_MOST, `${x.max}${unit}`) : '';
  };
  const usual = (): string => {
    const x = fd();
    if (x === null) return '';
    if (x.required) return t(L.REQUIRED);
    if (x.kind === Kind.Obj || x.kind === Kind.List || x.kind === Kind.Rows || x.kind === Kind.Texts) return '';
    const d = x.kind === Kind.Tuple ? JSON.stringify(x.def).replaceAll(',', ', ') : `${x.def}`;
    return f(L.DEFAULT, d === '' ? t(L.NONE) : d);
  };
  const facts = (): string => [limits(), usual()].filter((s: string) => s.length > 0).join('   ·   ');
  return <view class="flex-col gap-1 px-4 py-3 shrink-0 bg-zinc-950 border-t border-zinc-800" style={{ height: 132 }}>
    <view class="flex-row items-center gap-2">
      <Ico name="info" size={13} color={fd() === null ? MUTED : ACCENT} />
      <text class="text-xs font-bold text-zinc-200">{fd() === null ? t(L.HELP) : fieldName((fd() as Field).name)}</text>
      <view class="grow" />
      <text class="font-mono text-[10px] text-zinc-600">{fd() === null ? '' : helped()}</text>
    </view>
    <text class="text-[11px] text-zinc-400" style={{ width: 308 }}>{fd() === null ? t(L.HELP_HINT) : (fd() as Field).doc}</text>
    <text class="text-[11px] text-zinc-500">{facts()}</text>
  </view>;
}

// ---------------------------------------------------------------- the selection

const written = createNodeRef();
let toWrite = false;
/** Shows the selection as the file has it and puts the caret in that text (Cmd+J). */
export function editAsFile(): void {
  if (selected() === '') return;
  if (advanced() && wanted() === '' && written.node >= 0) { ui.focusNode(written.node); return; }
  toWrite = true;
  setWanted('');
  setAdvanced(true);
}
/** The selection as the file has it. Leaving the field after an edit checks the text as a file is checked, and takes it. */
function Written(): i32 {
  if (toWrite) { toWrite = false; queueMicrotask(() => { if (written.node >= 0) ui.focusNode(written.node); }); }
  return <view class="flex-col gap-1 px-4 mt-4">
    <Heading label={t(L.IN_FILE)} />
    <text class="text-[11px] text-zinc-500" style={{ width: 308 }}>{t(L.IN_FILE_HINT)}</text>
    <textarea ref={written} class="font-mono text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-md p-2 focus:border-amber-400" style={{ height: 150 }}
      value={doc().jsonOf(selected())} onChange={(v: string) => { if (!replaceSelected(v)) refresh(); }} />
  </view>;
}

/** The form of one selection. It is built again when another thing is selected. */
function Panel(p: { path: string }): i32 {
  const path = p.path, list = listOf(path), parts = steps(path);
  // what kind of thing it is: a list of the table has its own word, an item deeper in (a rule, a step) the format's
  const kind = path === '' ? listName('', true) : parts.length === 1 ? listName(parts[0], true) : parts.length === 2 && list !== '' ? listName(list, true) : kindName(schemaAt(path).name);
  // the objects it is in, the outermost first: a step is in a mission, which is in the rules
  const above: string[] = [];
  for (let k = 1; k < parts.length; k++) {
    const up = pathOf(parts.slice(0, k)), v: any = doc().get(up);
    if (v !== undefined && v !== null && typeof v === 'object' && !Array.isArray(v)) above.push(up);
  }
  const sound = (): string => { const id = schemaAt(path).field('id'); return id !== null && id.to === 'sounds' ? `${doc().get(`${path}.id`)}` : ''; };
  const hits = (): string[] => wanted().trim() === '' ? [] : found(schemaAt(path), path, wanted(), fieldName, (fd: Field, at: string): boolean => !offered(fd, at), doc().data);
  // an object that is of a kind (an action reached by itself) is its sentence; a rule is titled by what happens and where
  const sentence = !advanced() && path !== '' && schemaAt(path).variants !== null;
  const title = (): string => {
    if (path === '') return `${doc().get('name')}`;
    const s = sentenceAt(path), v: any = doc().get(path);
    if (s !== '' && v !== undefined && !sentence) return whenSaid(`${v.on}`, `${v.event}`);
    return s !== '' ? s : parts.length > 2 ? doc().summaryOf(path) : doc().nameOf(path);
  };
  return <view class="flex-col pb-4">
    <Show when={wanted().trim() === ''}>
      <view class="flex-col">
        <Show when={above.length > 0}>
          <view class="flex-row items-center gap-1 px-3 pt-3">
            {above.map((up: string, i: i32) => <button class="flex-row items-center gap-1 h-6 px-1 rounded cursor-pointer bg-transparent hover:bg-zinc-800" onClick={() => select(up)}>
              <text class="truncate text-[11px] text-zinc-400" style={{ maxWidth: 120 }}>{steps(up).length === 1 ? listName(up, false) : doc().nameOf(up)}</text>
              <Ico name="chevron-right" size={11} color={MUTED} />
            </button>)}
          </view>
        </Show>
        <view class="flex-col gap-1 px-4 pt-4 pb-3">
          <Heading label={kind} />
          {sentenceAt(path) === '' ? <text class="text-lg font-bold text-zinc-100 truncate" style={{ maxWidth: 308 }}>{title()}</text>
            : <text class="text-sm font-bold text-zinc-100" style={{ width: 308 }}>{title()}</text>}
          <text class="text-[11px] text-zinc-500" style={{ width: 308 }}>{schemaAt(path).doc}</text>
        </view>
        <Show when={path === ''}><text class="px-4 pb-3 text-xs text-zinc-400" style={{ width: 340 }}>{t(L.NOTHING_SELECTED)}</text></Show>
        <Show when={list !== ''}>
          <view class="flex-col gap-2 px-4 pb-3">
            <view class="flex-row gap-2">
              <Action icon="copy" label={t(L.DUPLICATE)} look="plain" onClick={duplicateSelected} />
              <Show when={selectionPlaced()}><Action icon="square-split-horizontal" label={t(L.MIRROR)} look="plain" onClick={mirrorSelected} /></Show>
              <Action icon="trash" label={t(L.DELETE)} look="danger" onClick={deleteSelected} />
            </view>
            <view class="flex-row gap-2">
              <Show when={sound() !== ''}><Action icon="play" label={t(L.LISTEN)} look="primary" onClick={() => { previewSound(sound()); }} /></Show>
              <Action icon="arrow-up" label="" look="plain" onClick={() => reorderSelected(-1)} />
              <Action icon="arrow-down" label="" look="plain" onClick={() => reorderSelected(1)} />
            </view>
            <Show when={selectionTurns()}>
              <view class="flex-row gap-2">
                <Action icon="rotate-ccw" label="15°" look="plain" onClick={() => turnSelected(-15)} />
                <Action icon="rotate-cw" label="15°" look="plain" onClick={() => turnSelected(15)} />
              </view>
            </Show>
          </view>
        </Show>
        {sentence ? <view class="px-4"><view class="flex-row pl-2 pr-1 py-1 rounded-md bg-zinc-950 border border-zinc-800"><Sentence src={TABLE} schema={schemaAt(path)} item={path} width={290} /></view></view>
          : <Fields src={TABLE} schema={schemaAt(path)} path={path} whole={path !== ''} />}
        <Show when={advanced() && path !== ''}><Written /></Show>
      </view>
    </Show>
    {/* the fields that answer to the box, alone and from the top: the first is always at the same place */}
    <Show when={wanted().trim() !== ''}>
      <view class="flex-col pt-2">
        <For each={hits()}>{(at: string, i: i32) => <Entry src={TABLE} field={fieldAt(at) as Field} path={at} />}</For>
        <Show when={hits().length === 0}><text class="px-4 py-3 text-xs text-zinc-500" style={{ width: 340 }}>{f(L.NO_FIELD, wanted().trim())}</text></Show>
      </view>
    </Show>
  </view>;
}
export function Properties(): i32 {
  // another selection starts with all its fields
  createEffect(() => { selected(); setWanted(''); });
  // one key per selection and per mode: the form is made again for another thing, and its fields follow the table by themselves
  return <view class="w-[340] shrink-0 flex-col bg-zinc-900 border-l border-zinc-800" onPointerLeave={(e: ui.PointerEvent) => setHelped('')}>
    <Finder />
    <scroll class="grow basis-0 min-h-0 flex-col">
      <For each={[`${selected()}|${advanced() ? 'a' : 'g'}`]}>{(key: string, i: i32) => <Panel path={key.slice(0, key.lastIndexOf('|'))} />}</For>
    </scroll>
    <Help src={TABLE} />
  </view>;
}
