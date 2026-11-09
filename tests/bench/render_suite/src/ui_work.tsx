// Structural work counts supplement frame timings: a binding write is not a layout or paint visit.
import { createEffect, createSignal, createNodeRef, NodeRef, For, Show, VirtualList, onCleanup } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { profiling } from 'zinc:gfx';

export const WORK_IDS: string[] = ['ui_noop', 'ui_sparse_label', 'ui_paint_only', 'ui_filter', 'ui_lifetime', 'ui_retained', 'ui_virtual'];
const [visible, setVisible] = createSignal<boolean>(false);
const [selected, setSelected] = createSignal<i32[]>([]);
const [revision, setRevision] = createSignal<number>(0);
const viewport = createNodeRef();
let id = '', wiring = '', count: i32 = 0, workFrames = 0;
let items: i32[] = [], values: number[] = [];
let reads: (() => number)[] = [], writes: ((v: number) => void)[] = [];
let active: boolean[] = [];
let refs: NodeRef[] = [], texts: NodeRef[] = [], identities: (ui.UiNode | null)[] = [];
let bindings = 0, components = 0, cleanups = 0, live = 0;
let failures: string[] = [], phases: string[] = [], previous: number[] = [];
let setupBindings = 0, setupComponents = 0, disposedBindings = 0;
enum Phase { Setup, Settled, Disposing, Complete }
let phase = Phase.Complete;
function transition(next: Phase): void {
  if (!((phase === Phase.Complete && next === Phase.Setup) || next === phase + 1)) throw new Error('invalid UI benchmark phase');
  phase = next;
}
function expect(ok: boolean, why: string): void { if (!ok && failures.indexOf(why) < 0) failures.push(why); }
function counters(): number[] {
  const v = ui.profileVisits();
  return [bindings, components, cleanups, ui.layoutCount(), v[0], v[1], v[2], v[3], ui.hostCommitCount()];
}
const memory: {rss_bytes: number | null; heap_bytes: number | null; status: string} = {rss_bytes: null, heap_bytes: null, status: 'unavailable: no in-process memory sampler'};
function record(name: string): void {
  const now = counters(), delta: number[] = [];
  for (let i = 0; i < now.length; i++) delta.push(now[i] - previous[i]);
  previous = now;
  phases.push(JSON.stringify({phase: name, binding_evaluations: delta[0], component_constructions: delta[1], cleanups: delta[2], live_rows: live,
    layout_passes: delta[3], measure_visits: profiling() ? delta[4] : null, place_visits: profiling() ? delta[5] : null,
    paint_visits: profiling() ? delta[6] : null, native_host_visits: profiling() ? delta[7] : null, native_host_commits: delta[8],
    memory}));
}
function value(i: i32): number { if (wiring === 'coarse') { revision(); return values[i]; } return reads[i](); }
function label(i: i32): string { bindings++; return `row ${i} value ${id === 'ui_paint_only' ? 0 : value(i)}`; }
function WorkRow(p: {i: i32}): i32 {
  const i = p.i;
  components++; live++; active[i] = true;
  onCleanup(() => { cleanups++; live--; active[i] = false; });
  const row = <View ref={refs[i]} className="h-[20]"><Text ref={texts[i]}>{label(i)}</Text></View>;
  if (id === 'ui_paint_only') createEffect(() => { bindings++; ui.setNumber(row, 'backgroundColor', value(i) % 2 === 0 ? 0xffffff : 0xf3f4f6); });
  return row;
}
function Rows(): i32 {
  if (id === 'ui_virtual') return <VirtualList ref={viewport} count={count} itemHeight={20} className="h-[120]">{(i: i32) => <WorkRow i={i} />}</VirtualList>;
  return <ScrollView ref={viewport} className="h-[120]"><For each={selected()}>{(i: i32) => <WorkRow i={i} />}</For></ScrollView>;
}
export function WorkApp(): i32 { return <View className="h-full bg-white"><Show when={visible()}><Rows /></Show></View>; }
export function beginWork(scene: string): void {
  id = scene; wiring = sys.env('ZB_WIRING') || 'fine';
  count = parseInt(sys.env('ZB_ROWS') || '100', 10) as i32;
  if ((wiring !== 'fine' && wiring !== 'coarse') || count < 2 || count > 100000 || !Number.isFinite(count)) throw new Error('ZB_ROWS must be 2..100000; ZB_WIRING must be fine or coarse');
  bindings = 0; components = 0; cleanups = 0; live = 0; failures = []; phases = [];
  items = []; values = []; reads = []; writes = []; refs = []; texts = []; identities = []; active = [];
  for (let i: i32 = 0; i < count; i++) {
    items.push(i); values.push(0); active.push(false); refs.push(createNodeRef()); texts.push(createNodeRef()); identities.push(null);
    const [get, set] = createSignal<number>(0); reads.push(get); writes.push(set);
  }
  setRevision(0); setSelected(items);
  previous = counters(); transition(Phase.Setup); setVisible(true);
}
function write(i: i32, v: number): void { values[i] = v; if (wiring === 'coarse') setRevision(v); else writes[i](v); }
function verify(): void {
  let found = 0;
  for (let i: i32 = 0; i < count; i++) {
    if (!active[i]) continue;
    const n = refs[i].node >= 0 ? ui.inspectNode(refs[i].node) : null;
    const t = texts[i].node >= 0 ? ui.inspectNode(texts[i].node) : null;
    if (n === null || t === null || ui.parentOf(texts[i].node) !== refs[i].node) continue;
    found++;
    if (id === 'ui_paint_only') expect(n.bg === (values[i] % 2 === 0 ? 0xffffff : 0xf3f4f6), 'paint color incorrect');
    expect(t.text === `row ${i} value ${id === 'ui_paint_only' ? 0 : values[i]}`, 'local text incorrect');
    if (id === 'ui_sparse_label' || id === 'ui_noop' || id === 'ui_paint_only' || id === 'ui_retained' || (id === 'ui_filter' && i % 2 === 0)) expect(identities[i] === n, 'retained row identity changed');
  }
  expect(found === live, 'live row count differs from tree');
  expect(live > 0, 'no rows rendered');
  if (id !== 'ui_virtual') expect(live === (id === 'ui_filter' ? selected().length : count), 'filter or retained row count incorrect');
  if (id === 'ui_virtual') expect(live <= Math.min(count, 12), 'virtual list retained offscreen rows');
}
/** Called before ui.frame: snapshots include the previous frame's layout/paint, never an unpainted final mutation. */
export function tickWork(f: number, per: number): void {
  workFrames = per;
  if (f === 2) {
    for (let i: i32 = 0; i < count; i++) if (refs[i].node >= 0) identities[i] = ui.inspectNode(refs[i].node);
    record('creation'); setupBindings = bindings; setupComponents = components; transition(Phase.Settled);
  }
  if (f >= 2 && f < per - 2) {
    if (id === 'ui_noop') write(0, 0);
    else if (id === 'ui_sparse_label' || id === 'ui_paint_only') write(0, f);
    else if (id === 'ui_filter') setSelected(f % 2 === 0 ? items.filter((i: i32) => i % 2 === 0) : items);
    else if (id === 'ui_lifetime') { setVisible(false); setVisible(true); }
    else ui.scrollTo(viewport.node, 0, f % 2 === 0 ? 200 : 0);
  }
  if (f === per - 2) {
    verify();
    if (id === 'ui_noop') { expect(bindings === setupBindings, 'equal write evaluated bindings'); expect(ui.layoutCount() === previous[3], 'equal write ran layout'); const v = ui.profileVisits(); expect(v[0] === previous[4] && v[2] === previous[6] && v[3] === previous[7], 'equal write visited UI stages'); }
    if (id === 'ui_sparse_label' || id === 'ui_paint_only') {
      expect(bindings - setupBindings === (per - 4) * (wiring === 'coarse' ? count : 1), 'sparse binding count incorrect');
      expect(components === count, 'sparse update rebuilt components');
    }
    if (id === 'ui_filter') expect(components === count + Math.floor((per - 4) / 2) * Math.floor(count / 2), 'filter did not create/dispose expected rows');
    if (id === 'ui_lifetime') expect(components === count * (per - 3), 'lifetime did not remount rows');
    if (id === 'ui_retained' || id === 'ui_virtual') {
      const offset = (per - 3) % 2 === 0 ? Math.min(200, Math.max(0, count * 20 - 120)) : 0;
      expect(Math.abs(ui.scrollTop(viewport.node) - offset) < 0.01, 'scroll offset incorrect');
      expect(active[Math.floor(offset / 20) as i32], 'visible scroll row missing');
      if (id === 'ui_retained') expect(components === count, 'scroll rebuilt retained rows');
      else if (count > 12) expect(components > setupComponents, 'virtual scroll did not recycle rows');
    }
    if (id === 'ui_paint_only') expect(ui.layoutCount() === previous[3], 'paint-only update ran layout');
    record('settled'); identities = []; transition(Phase.Disposing); setVisible(false); disposedBindings = bindings;
  }
  if (f === per - 1) {
    for (let i: i32 = 0; i < count; i++) write(i, 999 + i);
    setSelected([]);
    expect(bindings === disposedBindings, 'disposed binding still subscribed');
    expect(live === 0 && cleanups === components, 'row cleanup incomplete');
  }
  if (f === per) { record('disposal'); transition(Phase.Complete); }
}
export function workResult(): string {
  if (phase !== Phase.Complete) {
    expect(false, 'scene ended before disposal oracle'); setVisible(false);
    if (phase === Phase.Setup) transition(Phase.Settled);
    if (phase === Phase.Settled) transition(Phase.Disposing);
    transition(Phase.Complete);
  }
  return '{"scenario_version":1,"frames":' + workFrames + ',"model":"retained-solid-signals","wiring":' + JSON.stringify(wiring) + ',"rows":' + count + ',"oracle":{"pass":' + (failures.length === 0 && phase === Phase.Complete ? 'true' : 'false') + ',"failures":' + JSON.stringify(failures) + '},"phases":[' + phases.join(',') + '],"unmeasured":["style visits","Yoga internal visits","DOM host visits","RSS","heap"]}';
}
