// The panel at the right: the properties of what is selected, as a form GENERATED from the format's schema. No field is named here:
// the kind of a field decides its control (a number with its limits, a switch, a choice among the words of an enum, a choice among
// the names of the table for a reference, a colour, a row of numbers), its label comes from the string table and its help is the
// format's own line. A field added to the format shows here without a change.
// The advanced mode shows the same fields by their keys in the file, and the selection as the file has it, which can be edited there.
import { createSignal, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Schema, Field, Kind } from '../../pinball3d/src/format/schema';
import { doc, selected, setField, replaceSelected, deleteSelected, turnSelected, selectionTurns, advanced, refresh } from './state';
import { fieldAt, schemaAt, listOf, steps } from './doc';
import { rgb } from './shapes';
import { Ico, Action, Segmented, Chooser, Switch, Heading, MUTED, ACCENT } from './widgets';
import * as L from './strings';
import { t, f, fieldName, listName } from './strings';

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

/** One line of the form: the label, the control, and the way back to the default when the field holds something else. */
function Row(p: { field: Field; path: string; children: () => i32 }): i32 {
  const changed = (): boolean => !p.field.required && doc().get(p.path) !== undefined && !doc().isDefault(p.path);
  return <view class="flex-row items-center gap-2 px-4 hover:bg-zinc-800" style={{ minHeight: 32 }} onPointerEnter={(e: ui.PointerEvent) => setHelped(p.path)}>
    <text class={`w-[112] shrink-0 truncate text-xs ${advanced() ? 'font-mono text-zinc-300' : 'text-zinc-400'}`}>{label(p.field)}</text>
    <view class="grow basis-0 min-w-0 flex-row items-center gap-1">{p.children()}</view>
    <button class={`w-[20] h-[20] items-center justify-center rounded cursor-pointer bg-transparent hover:bg-zinc-700 ${changed() ? '' : 'opacity-0'}`}
      onClick={() => { if (changed()) setField(p.path, p.field.def); }}>
      <Ico name="rotate-ccw" size={11} color={MUTED} />
    </button>
  </view>;
}
function NumberBox(p: { path: string; width: number }): i32 {
  return <input class={FIELD} style={{ width: p.width }} value={shown(doc().get(p.path))}
    onChange={(v: string) => { const n = typed(v); if (isNumber(n)) setField(p.path, n); else refresh(); }} />;
}
/** A row of numbers: a point, a size, a box. Each number is set alone; the row is written whole. */
function TupleBoxes(p: { field: Field; path: string }): i32 {
  const cells: i32[] = [];
  for (let i = 0; i < p.field.cols; i++) cells.push(i);
  return <view class="flex-row gap-1">
    {cells.map((i: i32, k: i32) => <input class={FIELD} style={{ width: p.field.cols > 3 ? 42 : 56 }} value={shown(doc().get(`${p.path}[${i}]`))}
      onChange={(v: string) => {
        const n = typed(v), row: any = doc().get(p.path), next: number[] = [];
        if (!isNumber(n)) { refresh(); return; }
        for (let c = 0; c < row.length; c++) { const old: number = row[c]; next.push(c === i ? n : old); }
        setField(p.path, next);
      }} />)}
  </view>;
}
function Control(p: { field: Field; path: string }): i32 {
  const fd = p.field, path = p.path;
  const text = (): string => { const v: any = doc().get(path); return typeof v === 'string' ? `${v}` : ''; };
  if (fd.kind === Kind.Num || fd.kind === Kind.Int) return <NumberBox path={path} width={84} />;
  if (fd.kind === Kind.Bool) return <Switch value={() => doc().get(path) === true} yes={t(L.YES)} no={t(L.NO)} onPick={(v: boolean) => { setField(path, v); }} />;
  if (fd.kind === Kind.Color) return <view class="flex-row items-center gap-2">
    <view class="w-[24] h-[24] rounded border border-zinc-600" style={{ bg: text().length === 7 ? rgb(text()) : 0 }} />
    <input class={`font-mono ${FIELD}`} style={{ width: 84 }} value={text()} onChange={(v: string) => { setField(path, v.trim().toLowerCase()); }} />
  </view>;
  if (fd.kind === Kind.Choice) {
    const said = (c: string): string => c === '' ? t(L.NONE) : c;
    if (fd.choices.length <= 3 && fd.choices.join('').length < 22) return <view style={{ width: WIDE }}><Segmented options={fd.choices} labels={fd.choices.map((c: string) => said(c))} value={text} onPick={(v: string) => { setField(path, v); }} /></view>;
    return <view style={{ width: WIDE }}><Chooser value={text} options={() => fd.choices} label={said} onPick={(v: string) => { setField(path, v); }} /></view>;
  }
  // a reference: one of the names the table has for it, or none
  if (fd.kind === Kind.Ref) return <view style={{ width: WIDE }}><Chooser value={text} options={() => fd.required ? doc().namesOf(fd.to) : [''].concat(doc().namesOf(fd.to))}
    label={(v: string) => v === '' ? t(L.NONE) : v} onPick={(v: string) => { setField(path, v); }} /></view>;
  if (fd.kind === Kind.Tuple) return <TupleBoxes field={fd} path={path} />;
  if (fd.kind === Kind.Rows) return <text class="text-xs text-zinc-500">{f(fd.maxCols === 3 ? L.POINTS : L.ROWS, `${doc().get(path) === undefined ? 0 : doc().get(path).length}`)}</text>;
  if (fd.kind === Kind.List) return <text class="text-xs text-zinc-500">{f(L.ITEMS, `${doc().get(path) === undefined ? 0 : doc().get(path).length}`)}</text>;
  if (fd.kind === Kind.Texts) {
    const lines = (): string => { const v: any = doc().get(path); const out: string[] = []; if (v !== undefined) for (let i = 0; i < v.length; i++) out.push(`${v[i]}`); return out.join('\n'); };
    return <textarea class="p-2 rounded-md bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 focus:border-amber-400" style={{ width: WIDE }} rows={4} placeholder={t(L.ONE_PER_LINE)} value={lines()}
      onChange={(v: string) => { setField(path, v.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0)); }} />;
  }
  return <input class={FIELD} style={{ width: WIDE }} value={text()} onChange={(v: string) => { setField(path, v); }} />;
}
/** One field of a form: an object of the format is a heading and its own fields under it, anything else a line. */
function Entry(p: { field: Field; path: string }): i32 {
  const fd = p.field;
  if (fd.kind !== Kind.Obj) return <Row field={fd} path={p.path}><Control field={fd} path={p.path} /></Row>;
  return <view class="flex-col mt-2">
    <view class="flex-row items-center px-4 h-7" onPointerEnter={(e: ui.PointerEvent) => setHelped(p.path)}><Heading label={label(fd)} /></view>
    <view class="flex-col ml-4 border-l border-zinc-800"><Fields schema={fd.of as Schema} path={p.path} whole={true} /></view>
  </view>;
}
/** The fields of an object of the table, in the order of the format. `whole`: with its objects and lists (false for the table itself,
 *  whose parts are the lines of the list at the left). */
function Fields(p: { schema: Schema; path: string; whole: boolean }): i32 {
  const at = (fd: Field): string => p.path === '' ? fd.name : `${p.path}.${fd.name}`;
  // what the file fixes for every table is not a choice
  const fields = p.schema.fields.filter((fd: Field) => !(fd.kind === Kind.Choice && fd.choices.length === 1) && (p.whole || (fd.kind !== Kind.Obj && fd.kind !== Kind.List)) && (advanced() || fd.name !== 'version' || p.path !== ''));
  return <view class="flex-col">{fields.map((fd: Field, i: i32) => <Entry field={fd} path={at(fd)} />)}</view>;
}

/** What the format says of the field the pointer is over: its line of help, its limits, its default, and its key in the file. */
function Help(): i32 {
  const fd = (): Field | null => helped() === '' ? null : fieldAt(helped());
  const limits = (): string => {
    const x = fd();
    if (x === null || (x.kind !== Kind.Num && x.kind !== Kind.Int)) return '';
    if (x.min > -1e300 && x.max < 1e300) return f(L.LIMITS, `${x.min}`, `${x.max}`);
    return x.min > -1e300 ? f(L.AT_LEAST, `${x.min}`) : x.max < 1e300 ? f(L.AT_MOST, `${x.max}`) : '';
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
/** The selection as the file has it. Leaving the field after an edit checks the text as a file is checked, and takes it. */
function Written(): i32 {
  return <view class="flex-col gap-1 px-4 mt-4">
    <Heading label={t(L.IN_FILE)} />
    <text class="text-[11px] text-zinc-500" style={{ width: 308 }}>{t(L.IN_FILE_HINT)}</text>
    <textarea class="font-mono text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-md p-2 focus:border-amber-400" style={{ height: 150 }}
      value={doc().jsonOf(selected())} onChange={(v: string) => { if (!replaceSelected(v)) refresh(); }} />
  </view>;
}

/** The form of one selection. It is built again when another thing is selected. */
function Panel(p: { path: string }): i32 {
  const path = p.path, list = listOf(path), parts = steps(path);
  const kind = path === '' ? '' : list !== '' ? list : parts[0];
  return <view class="flex-col pb-4">
    <view class="flex-col gap-1 px-4 pt-4 pb-3">
      <Heading label={listName(kind, true)} />
      <text class="text-lg font-bold text-zinc-100 truncate" style={{ maxWidth: 308 }}>{path === '' ? `${doc().get('name')}` : doc().nameOf(path)}</text>
      <text class="text-[11px] text-zinc-500" style={{ width: 308 }}>{schemaAt(path).doc}</text>
    </view>
    <Show when={path === ''}><text class="px-4 pb-3 text-xs text-zinc-400" style={{ width: 340 }}>{t(L.NOTHING_SELECTED)}</text></Show>
    <Show when={list !== ''}>
      <view class="flex-row gap-2 px-4 pb-3">
        <Show when={selectionTurns()}>
          <view class="grow flex-row gap-2">
            <Action icon="rotate-ccw" label="15°" look="plain" onClick={() => turnSelected(-15)} />
            <Action icon="rotate-cw" label="15°" look="plain" onClick={() => turnSelected(15)} />
          </view>
        </Show>
        <Action icon="trash" label={t(L.DELETE)} look="danger" onClick={deleteSelected} />
      </view>
    </Show>
    <Fields schema={schemaAt(path)} path={path} whole={path !== ''} />
    <Show when={advanced() && path !== ''}><Written /></Show>
  </view>;
}
export function Properties(): i32 {
  // one key per selection and per mode: the form is made again for another thing, and its fields follow the table by themselves
  return <view class="w-[340] shrink-0 flex-col bg-zinc-900 border-l border-zinc-800" onPointerLeave={(e: ui.PointerEvent) => setHelped('')}>
    <scroll class="grow basis-0 min-h-0 flex-col">
      <For each={[`${selected()}|${advanced() ? 'a' : 'g'}`]}>{(key: string, i: i32) => <Panel path={key.slice(0, key.lastIndexOf('|'))} />}</For>
    </scroll>
    <Help />
  </view>;
}
