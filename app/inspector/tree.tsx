// The tree of the Elements panel, as Chrome's: disclosure triangles (Alt-click opens or folds the whole subtree), the roots open and the rest
// folded, long lines wrapped under their tag (nothing clipped), Chrome's syntax colours, closing tags of open nodes and `…` in folded ones,
// layout badges and `== $0` on the selection, the arrow keys, the hovered row's node highlighted in the program, a text edited in its row by a
// double click (dev runs). Rows have their own heights in a virtual list. The model (folds, rows, edits) is elements.tsx.
import { createSignal, createNodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { call, view, sleep, setStatus, devRun, status } from './state';
import { Field, Toggle } from './widgets';
import { rows, Row, TNode, selected, select, target, toggleFold, setFold, isOpen, inlineText, lineOf, badgeOf, query, setQuery, refilter, renderedOnly,
  setRenderedOnly, componentsOnly, setComponentsOnly, hideWrappers, setHideWrappers, setTextOf, nodeOf } from './elements';

const [editing, setEditing] = createSignal<i32>(-1);   // the text node whose string is edited in its row
const [draft, setDraft] = createSignal<string>('');
const list = createNodeRef();

/** The node a row stands for in the program: a component's first element, a text's element. */
function hostOf(n: TNode): i32 {
  if (n.text) return n.parent !== null ? (n.parent as TNode).id : -1;
  if (!n.comp) return n.id;
  for (const k of n.kids) { const h = hostOf(k); if (h >= 0) return h; }
  return -1;
}
function highlight(id: i32): void {
  if (id >= 0) call('Overlay.highlightNode', `{"nodeId":${id},"highlightConfig":{}}`); else call('Overlay.hideHighlight', '{}');
}
function editText(t: TNode): void { setDraft(t.value); setEditing(t.id); }
async function commitText(id: i32, v: string): Promise<void> {
  if (editing() !== id) return;   // Escape: left without applying
  setEditing(-1);
  const n = nodeOf(id);
  if (n !== null && (n as TNode).value !== v) await setTextOf(id, v);
}

function TextEdit(p: { id: i32 }): i32 {
  const ref = createNodeRef();
  onMount(() => { ui.focusNode(ref.node); });
  return <Input ref={ref} className="flex-1 h-5 px-1 text-xs font-mono text-slate-900 bg-white border border-sky-500 rounded-sm" value={draft()}
    onInput={(v: string) => { setDraft(v); }} onChange={(v: string) => { commitText(p.id, v); }}
    onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Escape') { setEditing(-1); e.preventDefault(); } }} />;
}

function TreeRow(p: { r: Row }): i32 {
  const r = p.r, n = r.node, l = lineOf(r), badge = r.close ? '' : badgeOf(n);
  const fold = !r.close && !r.leaf && !n.text && inlineText(n) === null && n.kids.length > 0 && query().trim().length === 0;
  const t: TNode | null = r.close ? null : n.text ? n : inlineText(n);
  const ref = createNodeRef();
  onMount(() => { ui.setTextRuns(ref.node, l.runs); });
  return <View className={'flex-row items-start py-px pr-2 ' + (selected() === n.id && !r.close ? 'bg-sky-100' : r.match ? 'bg-amber-50' : 'bg-white hover:bg-slate-100')}
    style={{ paddingLeft: 4 + r.depth * 14 }}
    onPointerDown={(e: ui.PointerEvent) => { if (e.alt && fold) toggleFold(n.id, true); select(n.id); }}
    onDoubleClick={(e: ui.PointerEvent) => { if (t !== null) editText(t as TNode); else if (fold) toggleFold(n.id, false); }}
    onPointerEnter={(e: ui.PointerEvent) => { highlight(hostOf(n)); }} onPointerLeave={(e: ui.PointerEvent) => { highlight(target()); }}>
    <View className="w-3 h-4 flex-row items-center justify-center" onPointerDown={(e: ui.PointerEvent) => { if (fold) toggleFold(n.id, e.alt); else select(n.id); }}>
      <Text className="text-[8px] text-slate-500">{fold ? (isOpen(n) ? '▼' : '▶') : ''}</Text>
    </View>
    {t !== null && editing() === (t as TNode).id ? <TextEdit id={(t as TNode).id} /> :
      <Text ref={ref} className="flex-1 w-0 text-xs font-mono break-words">{l.text}</Text>}
    {badge.length > 0 ? <View className="ml-1 px-1 h-4 flex-row items-center rounded-sm border border-slate-300 bg-slate-50"><Text className="text-[10px] text-slate-600">{badge}</Text></View> : <View />}
    {selected() === n.id && !r.close ? <Text className="ml-1 text-xs text-slate-400">== $0</Text> : <View />}
  </View>;
}

export function ElementsView(): i32 {
  return <View className="flex-col flex-1 min-h-0">
    <View className="flex-row flex-wrap items-center gap-2 px-2 py-1 border-b">
      <Field value={query} width="w-56" onInput={(v: string) => { setQuery(v); refilter(); }} onChange={(v: string) => {}} />
      <Toggle label="Rendered only" on={renderedOnly()} onClick={() => { setRenderedOnly(!renderedOnly()); refilter(); }} />
      <Toggle label="Components only" on={componentsOnly()} onClick={() => { setComponentsOnly(!componentsOnly()); refilter(); }} />
      <Toggle label="Hide host wrappers" on={hideWrappers()} onClick={() => { setHideWrappers(!hideWrappers()); refilter(); }} />
      <Text className="text-xs text-slate-500">{rows().length + ' rows'}</Text>
    </View>
    <VirtualList ref={list} count={rows().length} estimatedItemHeight={18} className="flex-1 py-1">
      {(i: i32) => <TreeRow r={rows()[i]} />}
    </VirtualList>
  </View>;
}

function rowIndex(id: i32): i32 { const rs = rows(); for (let i = 0; i < rs.length; i++) if (rs[i].node.id === id && !rs[i].close) return i; return -1; }
/** Chrome's keys in the tree: up and down move the selection, right opens a folded node (then goes to its first child), left folds an open one
 *  (else goes to its parent). */
export async function navigate(key: string): Promise<void> {
  const rs = rows();
  let i = rowIndex(selected());
  if (i < 0) { if (rs.length > 0) await select(rs[0].node.id); return; }
  const n = rs[i].node;
  let j = i;
  if (key === 'ArrowDown') { j = i + 1; while (j < rs.length && rs[j].close) j++; }
  else if (key === 'ArrowUp') { j = i - 1; while (j >= 0 && rs[j].close) j--; }
  else if (key === 'ArrowRight') { if (setFold(n.id, true)) return; j = i + 1 < rs.length && rs[i + 1].depth > rs[i].depth ? i + 1 : i; }
  else if (key === 'ArrowLeft') { if (inlineText(n) === null && setFold(n.id, false)) return; j = i - 1; while (j >= 0 && (rs[j].close || rs[j].depth >= rs[i].depth)) j--; }
  if (j < 0 || j >= rs.length || j === i) return;
  await select(rs[j].node.id);
  if (list.node >= 0) ui.scrollToRow(list.node, rowIndex(selected()));
}
ui.onKey((e: ui.KeyEvent) => {
  if (view() !== 'elements' || ui.focusedField() >= 0 || editing() >= 0 || e.mods !== 0) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  navigate(e.key);
});

/** The node of the inspector's own tree under h that shows `text`. */
function findText(h: i32, text: string): ui.UiNode | null {
  const n = ui.inspectNode(h);
  if (n === null) return null;
  if ((n as ui.UiNode).text === text) return n;
  for (const k of (n as ui.UiNode).children) { const f = findText(k, text); if (f !== null) return f; }
  return null;
}
/** The first node at or above h that has a box (a dynamic child sits in a fragment). */
function boxAbove(h: i32): ui.UiNode | null {
  for (let n = ui.inspectNode(h); n !== null; n = ui.inspectNode((n as ui.UiNode).parent)) if ((n as ui.UiNode).tag !== ui.FRAGMENT) return n;
  return null;
}
/** ZINC_INSPECTOR_DUMP: a long row wrapped under its tag (no line clipped), the arrow keys, a text edited in its row. */
export async function dumpTree(): Promise<void> {
  let long: Row | null = null;
  const rs = rows();
  for (let i = 0; i < rs.length; i++) if (!rs[i].close && rs[i].node.cls.length > 80) { long = rs[i]; if (list.node >= 0) ui.scrollToRow(list.node, i); break; }
  if (long !== null) {
    await sleep(300);
    const tn = findText(list.node, lineOf(long as Row).text), row = tn !== null ? boxAbove((tn as ui.UiNode).parent) : null;
    if (tn !== null && row !== null) {
      const t = tn as ui.UiNode, w = row as ui.UiNode;
      console.log('long row: ' + t.lines.length + ' lines, text ' + Math.round(t.lh) + ' px in a row of ' + Math.round(w.lh) + ' px, clipped ' + (t.lh > w.lh + 0.5));
    }
  }
  let text: TNode | null = null;   // the first text shown inline: the keys go to it, then it is edited in place
  for (const r of rows()) { const t = inlineText(r.node); if (!r.close && t !== null) { text = t; break; } }
  if (text === null) return;
  await select((text as TNode).id);
  const at = selected();
  await navigate('ArrowDown');
  const down = selected();
  await navigate('ArrowUp');
  console.log('keys: down moves ' + (down !== at) + ', up comes back ' + (selected() === at));
  editText(text as TNode);
  await commitText((text as TNode).id, 'Edited live');
  await sleep(300);
  const back = await call('DOM.getDocument', '{"depth":-1}');
  console.log('text edit: ' + (devRun() ? 'program text ' + (JSON.stringify(back).indexOf('"Edited live"') >= 0) : 'refused: ' + status()));
}
