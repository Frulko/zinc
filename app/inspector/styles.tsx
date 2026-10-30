// The Styles pane of the Elements panel, as Chrome's: the component, element.style with the properties that apply to the node's type (a Text's
// font, a View's layout, spacing and border, an Image's fit) each shown at its computed value, edited in place (click the value, type, Enter;
// the arrow keys step a number), added and switched off one by one; the classes as Chrome's .cls pane (a checkbox each, edited in place,
// completion of the known classes); the rules, the box model and the computed style, which follow each edit. Live in dev runs only; elsewhere
// the program refuses and the status line says why. A zinc:stage node shows its own editor (StageBox, elements.tsx).
import { createSignal, createNodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { devRun } from './state';
import { Btn, Flat, Toggle, Field, Mono } from './widgets';
import { comp, classes, classDraft, completions, complete, addClass, toggleClass, removeClass, editClass, isOn, decls, Decl, setProp, toggleProp, deleteProp,
  propName, setPropName, propValue, setPropValue, rules, box, boxLines, styles, computedValue, target, nodeOf, propsFor, stepValue, stageAttrs, StageBox, CompBox,
  TNode } from './elements';

const [editing, setEditing] = createSignal<string>('');   // what is edited in place: 'c:<class>' or 'p:<property>'
const [draft, setDraft] = createSignal<string>('');

/** A field over a class or a value: Enter (or leaving it) applies, Escape leaves it unchanged; `step` makes the arrow keys step its number
 *  (Shift: by 10, Alt: by 0.1), applied at each step. */
function InlineEdit(p: { id: string; step: boolean; onDone: (v: string) => void }): i32 {
  const ref = createNodeRef();
  onMount(() => { ui.focusNode(ref.node); });
  return <Input ref={ref} className="flex-1 h-5 px-1 text-xs font-mono text-slate-900 bg-white border border-sky-500 rounded-sm" value={draft()}
    onInput={(v: string) => { setDraft(v); }} onChange={(v: string) => { if (editing() === p.id) { setEditing(''); p.onDone(v); } }}
    onKeyDown={(e: ui.KeyEvent) => {
      if (e.key === 'Escape') { setEditing(''); e.preventDefault(); return; }
      if (!p.step || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const by = (e.key === 'ArrowUp' ? 1 : -1) * (e.shift ? 10 : e.alt ? 0.1 : 1);
      setDraft(stepValue(draft(), by));
      p.onDone(draft());   // applied at once; the field stays (the pane is built again around it)
    }} />;
}
function start(id: string, value: string): void { setDraft(value); setEditing(id); }

function ClassRow(p: { c: string }): i32 {
  const on = isOn(p.c), id = 'c:' + p.c;
  return <View className="flex-row items-center gap-1 h-6">
    <Toggle label="" on={on} onClick={() => { toggleClass(p.c); }} />
    {editing() === id ? <InlineEdit id={id} step={false} onDone={(v: string) => { editClass(p.c, v); }} /> :
      <Button className="flex-1 flex-row items-center justify-start h-5 bg-transparent" onClick={() => { start(id, p.c); }}>
        <Text className={'text-xs font-mono ' + (on ? 'text-slate-900' : 'text-slate-400 line-through')}>{p.c}</Text>
      </Button>}
    <Button className="h-5 px-1 flex-row items-center bg-transparent" onClick={() => { removeClass(p.c); }}><Text className="text-xs text-slate-400">×</Text></Button>
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
  const r = p.r, id = 'p:' + r.name;
  return <View className="flex-row items-center gap-1 h-5">
    <Toggle label="" on={r.set && r.on} onClick={() => { if (r.set) toggleProp(r.name); else setProp(r.name, r.value); }} />
    <Text className={'text-xs font-mono ' + (!r.set ? 'text-slate-500' : r.on ? 'text-rose-700' : 'text-slate-400 line-through')}>{r.name + ':'}</Text>
    {editing() === id ? <InlineEdit id={id} step={true} onDone={(v: string) => { if (r.set || v.trim() !== r.value) setProp(r.name, v); }} /> :
      <Button className="flex-1 flex-row items-center justify-start h-5 bg-transparent" onClick={() => { start(id, r.value); }}>
        <Text className={'text-xs font-mono ' + (r.set ? 'text-slate-900' : 'text-slate-500')}>{r.value.length > 0 ? r.value : '—'}</Text>
      </Button>}
    {r.set ? <Button className="h-5 px-1 flex-row items-center bg-transparent" onClick={() => { deleteProp(r.name); }}><Text className="text-xs text-slate-400">×</Text></Button> : <View />}
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
    <Text className={'text-xs ' + (devRun() ? 'text-emerald-700' : 'text-amber-700')}>{devRun() ? 'Live: edits apply at once and are not written to your source (the console prints the patch).' :
      'Read-only: live styling needs a dev run (start the program with zinc dev).'}</Text>
    <Text className="text-xs font-medium text-slate-600">element.style</Text>
    <View className="flex-col">{propRows().map((r: PRow) => <PropRow r={r} />)}</View>
    <View className="flex-row items-center gap-1">
      <Field value={propName} width="w-28" onInput={(v: string) => { setPropName(v); }} onChange={(v: string) => {}} />
      <Field value={propValue} width="w-20" onInput={(v: string) => { setPropValue(v); }} onChange={(v: string) => { setProp(propName(), v); }} />
      <Btn label="Add" onClick={() => { setProp(propName(), propValue()); }} />
    </View>
    <Text className="text-xs font-medium text-slate-600">.cls</Text>
    <View className="flex-col">{classes().map((x: string) => <ClassRow c={x} />)}</View>
    <View className="flex-row items-center gap-1">
      <Field value={classDraft} width="w-40" onInput={(v: string) => { complete(v); }} onChange={(v: string) => { addClass(v); }} />
      <Btn label="Add class" onClick={() => { addClass(classDraft()); }} />
    </View>
    <View className="flex-row flex-wrap gap-1">{completions().map((x: string) => <Flat label={x} on={false} onClick={() => { addClass(x); }} />)}</View>
    <View className="flex-col">{rules().map((l: string) => <Mono text={l} color="text-slate-700" />)}</View>
    <Text className="text-xs font-medium text-slate-600">{box() === '' ? 'Box model' : 'Box model · ' + box()}</Text>
    <View className="flex-col">{boxLines().map((l: string) => <Mono text={l} color="text-slate-700" />)}</View>
    <Text className="text-xs font-medium text-slate-600">Computed</Text>
    <View className="flex-col">{styles().map((s: string) => <Mono text={s} color="text-slate-800" />)}</View>
  </View>;
}
