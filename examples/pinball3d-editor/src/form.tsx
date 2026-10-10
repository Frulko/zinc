// The panel at the right: the properties of what is selected, as a form GENERATED from the format's schema. No field is named here:
// the kind of a field decides its control (a number with its limits and its unit, a switch, a choice among the words of an enum, a
// choice among the names of the table for a reference, a colour, a row of numbers, a curve for a height profile), its label comes
// from the string table and its help is the format's own line. A field added to the format shows here without a change.
// A schema of a hundred fields needs a way to one of them: the box at the top finds the fields of the selection by their name or
// their key (Cmd+F), and shows only those.
// The advanced mode shows the same fields by their keys in the file, and the selection as the file has it, which can be edited
// there (Cmd+J).
// The forms read and write through a Source: the open table here, a schema kept with the test in formcheck.tsx.
import { createSignal, createNodeRef, createEffect, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rect, stroke } from 'zinc:gfx';
import { Schema, Field, Kind } from '../../pinball3d/src/format/schema';
import { doc, table, selected, setField, replaceSelected, deleteSelected, duplicateSelected, mirrorSelected, turnSelected, selectionTurns, selectionPlaced, advanced, setAdvanced, refresh,
  activeRow, setActiveRow, dragRow, changeRows } from './state';
import { fieldAt, schemaAt, listOf, steps, found, isPath, isProfile } from './doc';
import { rgb } from './shapes';
import { Ico, Action, Segmented, Chooser, Switch, Heading, MUTED, ACCENT, chord } from './widgets';
import * as L from './strings';
import { t, f, fieldName, listName } from './strings';

/** What a form shows and changes. */
export class Source {
  get(path: string): any { return undefined; }
  /** Whether the field holds its default (the way back to it is then not offered). */
  isDefault(path: string): boolean { return true; }
  /** The names a reference to this name space may hold. */
  names(space: string): string[] { return []; }
  set(path: string, value: any): void {}
  field(path: string): Field | null { return null; }
}
/** The open table. */
class TableSource extends Source {
  get(path: string): any { return doc().get(path); }
  isDefault(path: string): boolean { return doc().isDefault(path); }
  names(space: string): string[] { return doc().namesOf(space); }
  set(path: string, value: any): void { setField(path, value); }
  field(path: string): Field | null { return fieldAt(path); }
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
function Control(p: { src: Source; field: Field; path: string }): i32 {
  const fd = p.field, path = p.path, src = p.src;
  const text = (): string => { const v: any = src.get(path); return typeof v === 'string' ? `${v}` : ''; };
  const count = (): string => { const v: any = src.get(path); return v === undefined ? '0' : `${v.length}`; };
  if (fd.kind === Kind.Num || fd.kind === Kind.Int) return <view class="flex-row items-center gap-[6]">
    <input class={FIELD} style={{ width: 84 }} value={shown(src.get(path))} onChange={(v: string) => { const n = typed(v); if (isNumber(n)) src.set(path, n); else refresh(); }} />
    <Unit of={fd} />
  </view>;
  if (fd.kind === Kind.Bool) return <Switch value={() => src.get(path) === true} yes={t(L.YES)} no={t(L.NO)} onPick={(v: boolean) => { src.set(path, v); }} />;
  if (fd.kind === Kind.Color) return <view class="flex-row items-center gap-2">
    <view class="w-[24] h-[24] rounded border border-zinc-600" style={{ bg: text().length === 7 ? rgb(text()) : 0 }} />
    <input class={`font-mono ${FIELD}`} style={{ width: 84 }} value={text()} onChange={(v: string) => { src.set(path, v.trim().toLowerCase()); }} />
  </view>;
  if (fd.kind === Kind.Choice) {
    const said = (c: string): string => c === '' ? t(L.NONE) : c;
    if (fd.choices.length <= 3 && fd.choices.join('').length < 22) return <view style={{ width: WIDE }}><Segmented options={fd.choices} labels={fd.choices.map((c: string) => said(c))} value={text} onPick={(v: string) => { src.set(path, v); }} /></view>;
    return <view style={{ width: WIDE }}><Chooser value={text} options={() => fd.choices} label={said} onPick={(v: string) => { src.set(path, v); }} /></view>;
  }
  // a reference: one of the names the table has for it, or none
  if (fd.kind === Kind.Ref) return <view style={{ width: WIDE }}><Chooser value={text} options={() => fd.required ? src.names(fd.to) : [''].concat(src.names(fd.to))}
    label={(v: string) => v === '' ? t(L.NONE) : v} onPick={(v: string) => { src.set(path, v); }} /></view>;
  if (fd.kind === Kind.Tuple) return <view class="flex-row items-center gap-[6]"><TupleBoxes src={src} field={fd} path={path} /><Unit of={fd} /></view>;
  if (fd.kind === Kind.Rows) return <text class="text-xs text-zinc-500">{f(fd.role === 'path' ? L.POINTS : L.ROWS, count())}</text>;
  if (fd.kind === Kind.List) return <text class="text-xs text-zinc-500">{f(L.ITEMS, count())}</text>;
  if (fd.kind === Kind.Texts) {
    const lines = (): string => { const v: any = src.get(path); const out: string[] = []; if (v !== undefined) for (let i = 0; i < v.length; i++) out.push(`${v[i]}`); return out.join('\n'); };
    return <textarea class="p-2 rounded-md bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 focus:border-amber-400" style={{ width: WIDE }} rows={4} placeholder={t(L.ONE_PER_LINE)} value={lines()}
      onChange={(v: string) => { src.set(path, v.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0)); }} />;
  }
  return <input class={FIELD} style={{ width: WIDE }} value={text()} onChange={(v: string) => { src.set(path, v); }} />;
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
  const kind = path === '' ? '' : list !== '' ? list : parts[0];
  const hits = (): string[] => wanted().trim() === '' ? [] : found(schemaAt(path), path, wanted(), fieldName, (fd: Field, at: string): boolean => !offered(fd, at));
  return <view class="flex-col pb-4">
    <Show when={wanted().trim() === ''}>
      <view class="flex-col">
        <view class="flex-col gap-1 px-4 pt-4 pb-3">
          <Heading label={listName(kind, true)} />
          <text class="text-lg font-bold text-zinc-100 truncate" style={{ maxWidth: 308 }}>{path === '' ? `${doc().get('name')}` : doc().nameOf(path)}</text>
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
            <Show when={selectionTurns()}>
              <view class="flex-row gap-2">
                <Action icon="rotate-ccw" label="15°" look="plain" onClick={() => turnSelected(-15)} />
                <Action icon="rotate-cw" label="15°" look="plain" onClick={() => turnSelected(15)} />
              </view>
            </Show>
          </view>
        </Show>
        <Fields src={TABLE} schema={schemaAt(path)} path={path} whole={path !== ''} />
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
