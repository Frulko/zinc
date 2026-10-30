// The Styles pane of the Elements panel, as Chrome's: the component, element.style with the properties that apply to the node's type (a Text's
// font, a View's layout, spacing and border, an Image's fit) each shown at its computed value, edited in place: a click on a name or a value
// edits it, a click on the empty line under them adds a declaration (name, Tab or Enter, value; Shift+Tab goes back; a pasted `a: b; c: d`
// adds them all; Escape cancels), the names and the keywords completed from the program's own list in a dropdown (Up, Down, Enter, Tab), the
// arrow keys step a number with its unit, a colour's swatch opens a palette. The classes as Chrome's .cls pane (a checkbox each, edited in
// place, a field that takes several classes with a completion that previews each class on the node, or the whole className as text). Undo
// and redo per node (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z), the Changes of the session (what to write in the source, copied with one click; the
// inspector never writes it), the rules, the box model and the computed style. Live in dev runs only; elsewhere the program refuses and the
// status line says why. A zinc:stage node shows its own editor (StageBox, elements.tsx).
import { createSignal, createNodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { setClipboardText } from 'zinc:gfx';
import { devRun, view, setStatus, call, sleep, until } from './state';
import { Flat, Toggle, Mono } from './widgets';
import { comp, classes, classDraft, setClassDraft, completions, complete, addClass, toggleClass, removeClass, editClass, isOn, decls,
  setProp, setProps, declPairs, renameProp, toggleProp, deleteProp, rules, box, boxLines, styles, computedValue, target, nodeOf, propsFor, stepValue, stageAttrs,
  StageBox, CompBox, TNode, nameCompletions, valueCompletions, propInfo, previewClass, classText, setClassText, undo, canUndo, history, changes, changesText,
  Change, CssProp, select, findNode } from './elements';

// What is edited in place: 'c:<class>', 'n:<property>' (its name), 'v:<property>' (its value), 'nn' / 'nv' the name and value of a new
// declaration, 'ct' the className as text; '' nothing.
export const [editing, setEditing] = createSignal<string>('');
export const [draft, setDraft] = createSignal<string>('');
const [newName, setNewName] = createSignal<string>('');   // the name of the new declaration while its value is typed
export const [sugg, setSugg] = createSignal<string[]>([]);  // the dropdown of the field edited, and the entry chosen in it (-1: none)
export const [suggAt, setSuggAt] = createSignal<i32>(-1);
const [palette, setPalette] = createSignal<string>('');   // the colour property whose palette is open

/** The dropdown for what the field `id` holds: property names, a property's keywords, or the known classes (asked of the program). */
function suggest(id: string, v: string): void {
  setSuggAt(-1);
  if (id === 'nn' || id.startsWith('n:')) setSugg(v.indexOf(':') >= 0 ? [] : nameCompletions(v));
  else if (id === 'nv') setSugg(valueCompletions(newName(), v));
  else if (id.startsWith('v:')) setSugg(valueCompletions(id.slice(2), v));
  else if (id === 'cls') complete(v).then(() => { setSugg(completions()); setSuggAt(-1); });
  else setSugg([]);
}
/** Starts editing `id` with `value` in the field. */
export function start(id: string, value: string): void { setDraft(value); setEditing(id); setPalette(''); suggest(id, value); }
function stop(): void { setEditing(''); setSugg([]); setSuggAt(-1); }

/** What the field `id` does with its text: Enter (`next` 0), Tab (1) or Shift+Tab (-1); a blur is Enter. */
export async function commit(id: string, v: string, next: i32): Promise<void> {
  if (editing() !== id) return;   // done already (Escape, Enter, a suggestion chosen)
  stop();
  const t = v.trim();
  if (id === 'nn') {   // a new declaration's name: on to its value; a pasted `a: b; c: d` adds them all
    if (t.indexOf(':') >= 0) { await setProps(declPairs(t)); return; }
    if (t.length > 0 && next >= 0) { setNewName(t); start('nv', ''); }
    return;
  }
  if (id === 'nv') {
    if (next < 0) { start('nn', newName()); return; }
    if (t.length > 0) await setProp(newName(), t);
    if (next > 0) start('nn', '');   // Tab: the next new declaration, as Chrome
    return;
  }
  if (id.startsWith('n:')) {   // a name edited in place: Tab goes on to its value
    const from = id.slice(2);
    if (t.indexOf(':') >= 0) { await deleteProp(from); await setProps(declPairs(t)); return; }
    await renameProp(from, t);
    if (next > 0 && t.length > 0) start('v:' + t, valueOf(t));
    return;
  }
  if (id.startsWith('v:')) {
    const name = id.slice(2);
    if (next < 0 && isSet(name)) { start('n:' + name, name); return; }
    if (isSet(name) || t !== computedValue(name)) await setProp(name, t);
    if (next > 0) { const n = nextSet(name); if (n.length > 0) start('n:' + n, n); else start('nn', ''); }
    return;
  }
  if (id === 'cls') { await previewClass(null); if (t.length > 0) await addClass(t); setClassDraft(''); return; }
  if (id === 'ct') { await setClassText(t); return; }
  if (id.startsWith('c:')) await editClass(id.slice(2), t);
}
function isSet(name: string): boolean { for (const d of decls()) if (d.name === name) return true; return false; }
function valueOf(name: string): string { for (const d of decls()) if (d.name === name) return d.value; return computedValue(name); }
function nextSet(name: string): string { const ds = decls(); for (let i = 0; i + 1 < ds.length; i++) if (ds[i].name === name) return ds[i + 1].name; return ''; }
/** The field's text with the dropdown's entry `s`: a class replaces the word being typed, the rest the whole text. */
function withSugg(id: string, s: string): string {
  if (id !== 'cls') return s;
  const d = draft();
  return d.slice(0, d.lastIndexOf(' ') + 1) + s;
}
/** The dropdown's entry `i` chosen: in the field, then applied (Enter) or on to the next field (Tab). */
async function choose(id: string, i: i32, next: i32): Promise<void> {
  const v = withSugg(id, sugg()[i]);
  setDraft(v);
  await commit(id, v, next);
}
/** The dropdown's entry `i` arrowed to or hovered: a class is previewed on the node, a keyword applied live (Escape takes either back). */
async function hoverSugg(id: string, i: i32): Promise<void> {
  setSuggAt(i);
  if (id === 'cls') await previewClass(i >= 0 ? sugg()[i] : null);
}
/** Escape: the field left unchanged, a previewed class taken back. */
export async function cancel(id: string): Promise<void> { if (editing() !== id) return; stop(); if (id === 'cls') await previewClass(null); }

/** The keys of every field of the pane, as Chrome's: Up and Down move in the dropdown (or step a number: Shift by 10, Alt by 0.1, applied at
 *  each step), Enter applies, Tab and Shift+Tab move between a declaration's name and value, Escape cancels. */
export async function fieldKey(id: string, e: ui.KeyEvent): Promise<void> {
  const k = e.key, list = sugg();
  if (k === 'Escape') { e.preventDefault(); await cancel(id); return; }
  if ((k === 'ArrowDown' || k === 'ArrowUp') && list.length > 0) {
    e.preventDefault();
    const n = list.length, at = suggAt();
    await hoverSugg(id, k === 'ArrowDown' ? (at + 1) % n : at <= 0 ? n - 1 : at - 1);
    return;
  }
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    if (!id.startsWith('v:') && id !== 'nv') return;
    e.preventDefault();
    const by = (k === 'ArrowUp' ? 1 : -1) * (e.shift ? 10 : e.alt ? 0.1 : 1), v = stepValue(draft(), by);
    setDraft(v);
    await setProp(id === 'nv' ? newName() : id.slice(2), v);   // applied at once; the field stays (the pane is built again around it)
    return;
  }
  if (k !== 'Enter' && k !== 'Tab') return;
  e.preventDefault();
  const next = k === 'Enter' ? 0 : e.shift ? -1 : 1;
  if (suggAt() >= 0 && next >= 0) await choose(id, suggAt(), next); else await commit(id, draft(), next);
}

/** A field over a name, a value or a class, its dropdown under it. A blur applies, after a click on the dropdown had its turn. */
function InlineEdit(p: { id: string; width: string }): i32 {
  const ref = createNodeRef();
  onMount(() => { ui.focusNode(ref.node); });
  return <Input ref={ref} className={'h-5 px-1 text-xs font-mono text-slate-900 bg-white border border-sky-500 rounded-sm min-w-0 ' + p.width} value={draft()}
    onInput={(v: string) => { setDraft(v); suggest(p.id, v); }} onChange={(v: string) => { setTimeout(() => { if (ui.focusedField() < 0) commit(p.id, v, 0); }, 0); }}
    onKeyDown={(e: ui.KeyEvent) => { fieldKey(p.id, e); }} />;
}
function Dropdown(p: { id: string }): i32 {
  return <View className="flex-col py-0.5 ml-4 mr-2 bg-white border border-slate-300 rounded shadow-md">
    {sugg().map((s: string, i: i32) => <View className={'flex-row items-center h-5 px-2 ' + (suggAt() === i ? 'bg-sky-100' : 'bg-white')}
      onPointerEnter={(e: ui.PointerEvent) => { hoverSugg(p.id, i); }} onPointerDown={(e: ui.PointerEvent) => { choose(p.id, i, 0); }}>
      <Text className="text-xs font-mono text-slate-800">{s}</Text>
    </View>)}
  </View>;
}
function DropdownFor(p: { id: string }): i32 { return editing() === p.id && sugg().length > 0 ? <Dropdown id={p.id} /> : <View />; }

function ClassRow(p: { c: string }): i32 {
  const on = isOn(p.c), id = 'c:' + p.c;
  return <View className="flex-col">
    <View className="flex-row items-center gap-1 h-6">
      <Toggle label="" on={on} onClick={() => { toggleClass(p.c); }} />
      {editing() === id ? <InlineEdit id={id} width="flex-1" /> :
        <Button className="flex-1 flex-row items-center justify-start h-5 bg-transparent" onClick={() => { start(id, p.c); }}>
          <Text className={'text-xs font-mono ' + (on ? 'text-slate-900' : 'text-slate-400 line-through')}>{p.c}</Text>
        </Button>}
      <Button className="h-5 px-1 flex-row items-center bg-transparent" onClick={() => { removeClass(p.c); }}><Text className="text-xs text-slate-400">×</Text></Button>
    </View>
  </View>;
}

/** 0xRRGGBB of a #rgb or #rrggbb value, -1 otherwise. */
export function hexColour(v: string): i32 {
  const t = v.trim().toLowerCase();
  if (!t.startsWith('#')) return -1;
  let x = t.slice(1);
  if (x.length === 3) x = x.charAt(0) + x.charAt(0) + x.charAt(1) + x.charAt(1) + x.charAt(2) + x.charAt(2);
  if (x.length === 8) x = x.slice(0, 6);
  const c = parseInt(x, 16);
  return x.length === 6 && !isNaN(c) ? c : -1;
}
function hexOf(c: i32): string { let s = c.toString(16); while (s.length < 6) s = '0' + s; return '#' + s; }
const HUES: string[] = ['slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const TONES: i32[] = [100, 300, 500, 700, 900];
/** The kit's palette (the Tailwind colours zinc:ui's classes use) and a hex field: a click sets the property. */
function Palette(p: { name: string }): i32 {
  const set = (c: i32): void => { setPalette(''); setProp(p.name, hexOf(c)); };
  return <View className="flex-col gap-1 p-1 ml-4 mr-2 bg-white border border-slate-300 rounded shadow-md">
    {TONES.map((t: i32) => <View className="flex-row gap-px">
      {HUES.map((h: string) => <Button className="w-3 h-3 rounded-sm" style={{ backgroundColor: ui.tailwindColor(h + '-' + t) }} onClick={() => { set(ui.tailwindColor(h + '-' + t)); }} />)}
    </View>)}
    <View className="flex-row items-center gap-1">
      <Button className="w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: 0xffffff }} onClick={() => { set(0xffffff); }} />
      <Button className="w-3 h-3 rounded-sm" style={{ backgroundColor: 0x000000 }} onClick={() => { set(0x000000); }} />
      <Input className="h-5 w-20 px-1 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-sm" value={valueOf(p.name)}
        onChange={(v: string) => { if (hexColour(v) >= 0) set(hexColour(v)); }} />
    </View>
  </View>;
}

/** A property of the pane: set in element.style (and on), or only the computed value shown. */
export class PRow { name: string = ''; value: string = ''; set: boolean = false; on: boolean = false; }
/** The properties of the target's type, then those element.style sets beyond them. */
export function propRows(): PRow[] {
  if (target() < 0) return [];
  const n = nodeOf(target()), names = propsFor(n !== null ? (n as TNode).tag : 'View').slice(0), ds = decls(), out: PRow[] = [];
  for (const d of ds) if (names.indexOf(d.name) < 0) names.push(d.name);
  for (const name of names) {
    const r = new PRow(); r.name = name; r.value = computedValue(name);
    for (const d of ds) if (d.name === name) { r.set = true; r.on = d.on; r.value = d.value; }
    out.push(r);
  }
  return out;
}
function PropRow(p: { r: PRow }): i32 {
  const r = p.r, nid = 'n:' + r.name, vid = 'v:' + r.name, info = propInfo(r.name), c = hexColour(r.value);
  return <View className="flex-col">
    <View className="flex-row items-center gap-1 h-5">
      <Toggle label="" on={r.set && r.on} onClick={() => { if (r.set) toggleProp(r.name); else setProp(r.name, r.value); }} />
      {editing() === nid ? <InlineEdit id={nid} width="w-28" /> :
        <Text className={'text-xs font-mono ' + (!r.set ? 'text-slate-500' : r.on ? 'text-rose-700' : 'text-slate-400 line-through')}
          onPointerDown={(e: ui.PointerEvent) => { if (r.set) start(nid, r.name); else start(vid, r.value); }}>{r.name + ':'}</Text>}
      {info !== null && (info as CssProp).kind === 'color' && c >= 0 ?
        <Button className="w-3 h-3 rounded-sm border border-slate-400" style={{ backgroundColor: c }} onClick={() => { setPalette(palette() === r.name ? '' : r.name); }} /> : <View />}
      {editing() === vid ? <InlineEdit id={vid} width="flex-1" /> :
        <Button className="flex-1 flex-row items-center justify-start h-5 bg-transparent" onClick={() => { start(vid, r.value); }}>
          <Text className={'text-xs font-mono ' + (r.set ? 'text-slate-900' : 'text-slate-500')}>{r.value.length > 0 ? r.value : '—'}</Text>
        </Button>}
      {r.set ? <Button className="h-5 px-1 flex-row items-center bg-transparent" onClick={() => { deleteProp(r.name); }}><Text className="text-xs text-slate-400">×</Text></Button> : <View />}
    </View>
    <DropdownFor id={nid} />
    <DropdownFor id={vid} />
    {palette() === r.name ? <Palette name={r.name} /> : <View />}
  </View>;
}
/** The line under element.style: a click starts a new declaration there (Chrome's empty area). */
function NewDecl(): i32 {
  return <View className="flex-col">
    {editing() === 'nn' || editing() === 'nv' ?
      <View className="flex-row items-center gap-1 h-5 pl-5">
        {editing() === 'nn' ? <InlineEdit id="nn" width="w-28" /> : <Text className="text-xs font-mono text-rose-700">{newName()}</Text>}
        <Text className="text-xs font-mono text-slate-500">:</Text>
        {editing() === 'nv' ? <InlineEdit id="nv" width="flex-1" /> : <View />}
      </View> :
      <View className="h-5 flex-row items-center pl-5" onPointerDown={(e: ui.PointerEvent) => { start('nn', ''); }}>
        <Text className="text-xs text-slate-400">{devRun() ? '+ add a declaration' : ''}</Text>
      </View>}
    <DropdownFor id="nn" />
    <DropdownFor id="nv" />
  </View>;
}
function ChangeView(p: { c: Change }): i32 {
  return <View className="flex-col">
    <Mono text={p.c.where} color="text-slate-600" />
    {p.c.was === 'style' ? <View /> : <Mono text={'- ' + p.c.was} color="text-rose-700" />}
    <Mono text={'+ ' + p.c.now} color="text-emerald-700" />
  </View>;
}
/** The changes of the session (Zinc.getStylePatch), with the Copy button; the source is never written. */
function Changes(): i32 {
  return changes().length === 0 ? <View /> : <View className="flex-col gap-1 p-2 rounded bg-emerald-50 border border-emerald-100">
    <View className="flex-row items-center gap-2">
      <Text className="flex-1 text-xs font-medium text-emerald-900">{'Changes · ' + changes().length + (changes().length === 1 ? ' node' : ' nodes')}</Text>
      <Flat label="Copy" on={false} onClick={() => { setClipboardText(changesText()); setStatus('changes copied: paste them into your source'); }} />
    </View>
    {changes().map((c: Change) => <ChangeView c={c} />)}
  </View>;
}

export function StylesPane(): i32 {
  return <ScrollView className="flex-1">
    {stageAttrs().length > 0 ? <StageBox /> : <CssPane />}
  </ScrollView>;
}
function CssPane(): i32 {
  return <View className="flex-col gap-2 p-2">
    {comp() !== null ? <CompBox c={comp() as TNode} /> : <View />}
    <Text className={'text-xs ' + (devRun() ? 'text-emerald-700' : 'text-amber-700')}>{devRun() ? 'Live: edits apply at once; your source is not written (copy the Changes below).' :
      'Read-only: live styling needs a dev run (start the program with zinc dev).'}</Text>
    <View className="flex-row items-center gap-1">
      <Text className="flex-1 text-xs font-medium text-slate-600">element.style</Text>
      {history() >= 0 && canUndo(false) ? <Flat label="Undo" on={false} onClick={() => { undo(false); }} /> : <View />}
      {history() >= 0 && canUndo(true) ? <Flat label="Redo" on={false} onClick={() => { undo(true); }} /> : <View />}
    </View>
    <View className="flex-col">{propRows().map((r: PRow) => <PropRow r={r} />)}</View>
    <NewDecl />
    <View className="flex-row items-center gap-1">
      <Text className="flex-1 text-xs font-medium text-slate-600">.cls</Text>
      <Flat label={editing() === 'ct' ? 'Editing as text' : 'Edit as text'} on={editing() === 'ct'} onClick={() => { if (editing() === 'ct') stop(); else start('ct', classText()); }} />
    </View>
    {editing() === 'ct' ? <View className="flex-row"><InlineEdit id="ct" width="flex-1" /></View> : <View className="flex-col">{classes().map((x: string) => <ClassRow c={x} />)}</View>}
    <View className="flex-row items-center gap-1">
      {editing() === 'cls' ? <InlineEdit id="cls" width="flex-1" /> :
        <View className="flex-1 h-6 px-2 flex-row items-center border border-slate-300 rounded" onPointerDown={(e: ui.PointerEvent) => { start('cls', classDraft()); }}>
          <Text className="text-xs text-slate-400">Add classes (space-separated)</Text>
        </View>}
    </View>
    <DropdownFor id="cls" />
    <Changes />
    <View className="flex-col">{rules().map((l: string) => <Mono text={l} color="text-slate-700" />)}</View>
    <Text className="text-xs font-medium text-slate-600">{box() === '' ? 'Box model' : 'Box model · ' + box()}</Text>
    <View className="flex-col">{boxLines().map((l: string) => <Mono text={l} color="text-slate-700" />)}</View>
    <Text className="text-xs font-medium text-slate-600">Computed</Text>
    <View className="flex-col">{styles().map((s: string) => <Mono text={s} color="text-slate-800" />)}</View>
  </View>;
}

// Cmd/Ctrl+Z undoes the selected node's last edit, Shift+Cmd/Ctrl+Z does it again (a text field keeps its own undo while it has the focus).
ui.onKey((e: ui.KeyEvent) => {
  if (view() !== 'elements' || ui.focusedField() >= 0 || !e.primary || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  undo(e.shift);
});

/** ZINC_INSPECTOR_DUMP: the pane driven by its keys on the second square of tests/data/inspector (a dev run): a declaration added with
 *  completion, Tab, Shift+Tab and Enter, a keyword chosen in the dropdown, a paste of two declarations, a number stepped with its unit, an
 *  Escape; a class previewed from the completion and taken back by Escape, two classes in one field, the className as text, undo and redo,
 *  and the Changes. */
export async function dumpStyles(): Promise<void> {
  const sq = findNode((n: TNode) => n.cls.indexOf('bg-sky-600') >= 0);
  if (sq === null || !devRun()) return;
  await select((sq as TNode).id);
  const key = async (k: string, mods: i32 = 0): Promise<void> => { ui.sendKey(k, mods); await sleep(150); };
  const type = async (s: string): Promise<void> => { ui.typeText(-1, s); await sleep(150); };
  const open = async (id: string, v: string): Promise<void> => { start(id, v); await until(() => ui.focusedField() >= 0); await sleep(100); };
  await open('nn', '');
  await type('paddi');
  const names = sugg().slice(0, 3).join(' ');
  await key('ArrowDown'); await key('Tab');   // the first name chosen, on to its value
  const onValue = editing() + ' ' + newName();
  await type('12px'); await key('Tab', ui.SHIFT);   // back to the name, then forth
  const back = editing() + ' ' + draft();
  await key('Tab'); await type('12px'); await key('Enter');
  await until(() => computedValue('padding-top') === '12px');
  console.log('add declaration: "paddi" -> ' + names + ' | Tab: ' + onValue + ' | Shift+Tab: ' + back + ' | Enter: padding-top ' + computedValue('padding-top') + ', editing "' + editing() + '"');
  await open('v:flex-direction', computedValue('flex-direction'));
  const kw = sugg().join(' ');
  setDraft(''); suggest('v:flex-direction', 'ro'); await key('ArrowDown'); await key('Enter');
  await until(() => computedValue('flex-direction') === 'row');
  console.log('keywords: ' + kw + ' | chosen: flex-direction ' + computedValue('flex-direction'));
  await open('nn', '');
  await type('margin-top: 3px; opacity: 0.5'); await key('Enter');
  await until(() => computedValue('opacity') === '0.5');
  console.log('paste: margin-top ' + computedValue('margin-top') + ', opacity ' + computedValue('opacity'));
  await setProp('width', '50%');
  await open('v:width', '50%'); await key('ArrowUp');
  const pct = draft();
  await key('Escape');
  await setProp('font-size', '1em');
  await open('v:font-size', '1em'); await key('ArrowUp', ui.SHIFT);
  console.log('units: width ' + pct + ', font-size ' + draft() + ' = ' + computedValue('font-size'));
  await key('Escape');
  const before = decls().length;
  await open('nn', ''); await type('color'); await key('Escape');
  console.log('escape: editing "' + editing() + '", declarations ' + before + ' -> ' + decls().length);
  const bg = async (): Promise<string> => {
    const r = await call('CSS.getComputedStyleForNode', `{"nodeId":${target()}}`);
    for (const p of r.computedStyle) { const nm: string = p.name; if (nm === 'background-color') { const v: string = p.value; return v; } }
    return '';
  };
  const bg0 = await bg();
  await open('cls', ''); await type('bg-emerald-');
  await until(() => sugg().length > 0);
  await key('ArrowDown');
  const bg1 = await bg(), shown = suggAt() >= 0 ? sugg()[suggAt()] : 'none';
  await key('Escape');
  console.log('class preview: ' + bg0 + ' -> ' + shown + ' ' + bg1 + ' -> Escape ' + (await bg()) + ' | ' + classText());
  await open('cls', ''); await type('rounded p-1'); await key('Enter');
  await until(() => classText().indexOf('p-1') >= 0);
  console.log('two classes: ' + classText());
  start('ct', classText()); await commit('ct', 'w-4 h-4 bg-sky-600 rounded-full', 0);
  console.log('as text: ' + classText());
  await key('z', ui.META);
  await until(() => classText().indexOf('p-1') >= 0);
  const undone = classText();
  await key('z', ui.META | ui.SHIFT);
  await until(() => classText().indexOf('rounded-full') >= 0);
  console.log('undo: ' + undone + ' | redo: ' + classText());
  for (const c of changes()) console.log('change: ' + c.where + ' | ' + c.was + ' | ' + c.now);
}
