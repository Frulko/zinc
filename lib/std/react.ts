// zinc:ui/react — React model (D-12, UI-04): function components and hooks. A component re-renders as a whole
// when its state changes, and the result is reconciled with the previous render like React does: host nodes are
// reused when the same tag comes at the same position (focus, animations and images survive), child components are
// matched by name and `key` (their state survives). Hook order is checked at build.
import * as ui from 'zinc:ui';

class Hook { }
class StateHook<T> extends Hook { value: T; constructor(v: T) { super(); this.value = v; } }
class EffectHook extends Hook { deps: string = '\u0000'; cleanup: (() => void) | null = null; }
class MemoHook<T> extends Hook { deps: string = '\u0000'; value: T; constructor(v: T) { super(); this.value = v; } }
export class MutableRef<T> extends Hook { current: T; constructor(v: T) { super(); this.current = v; } }

enum InstancePhase { Mounted, Unmounting, Unmounted }
class Instance {
  hooks: Hook[] = [];
  index: i32 = 0;
  host: i32;
  serial: i32;
  render: () => i32 | null;   // a component may render nothing (null), as in React
  scheduled: boolean = false;
  phase: InstancePhase = InstancePhase.Mounted;
  get dead(): boolean { return this.phase !== InstancePhase.Mounted; }   // unmounted: an update queued before (a window-size listener that was never removed) must not touch its host, whose handle may belong to another node by now
  effects: (() => void)[] = [];
  name: string;
  key: string;
  // reconciliation state: host nodes and child instances of the last render, in creation order
  nodes: i32[] = [];
  tags: i32[] = [];
  serials: i32[] = [];
  kids: Instance[] = [];
  nextNodes: i32[] = [];
  nextTags: i32[] = [];
  nextSerials: i32[] = [];
  nextKids: Instance[] = [];
  cursor: i32 = 0;
  kidCursor: i32 = 0;
  virtuals: Map<i32, VirtualRender> = new Map<i32, VirtualRender>();
  comp: ComponentBase | null = null;  // class components (Inferno/React classes)
  constructor(host: i32, render: () => i32 | null, name: string, key: string) { this.host = host; this.serial = ui.nodeSerial(host); this.render = render; this.name = name; this.key = key; instances.push(this); }
}
function instancePhase(inst: Instance, next: InstancePhase): void {
  if (!((inst.phase === InstancePhase.Mounted && next === InstancePhase.Unmounting) || (inst.phase === InstancePhase.Unmounting && next === InstancePhase.Unmounted))) throw new Error('invalid component transition');
  inst.phase = next;
}
function disposeAll(jobs: (() => void)[]): void {
  let failure: Error | null = null;
  for (const job of jobs) { try { job(); } catch (e) { if (failure === null) failure = e; } }
  if (failure !== null) throw failure;
}
enum VirtualPhase { Mounted, Closed }
class VirtualRender {
  phase: VirtualPhase = VirtualPhase.Mounted;
  host: i32;
  serial: i32;
  count: i32;
  itemH: number;
  render: (i: i32) => i32;
  rows: Map<i32, Instance> = new Map<i32, Instance>();
  constructor(host: i32, count: i32, itemH: number, render: (i: i32) => i32) { this.host = host; this.serial = ui.nodeSerial(host); this.count = count; this.itemH = itemH; this.render = render; }
}
function virtualPhase(v: VirtualRender, next: VirtualPhase): void {
  if (v.phase === next) return;
  if (v.phase !== VirtualPhase.Mounted || next !== VirtualPhase.Closed) throw new Error('invalid virtual render transition');
  v.phase = next;
  const rows = v.rows.keys();
  const jobs: (() => void)[] = [];
  for (const row of rows) jobs.push(() => dropRow(v, row));
  try { disposeAll(jobs); } finally { v.rows.clear(); v.render = (i: i32) => -1; }
}
function destroyHost(inst: Instance, host: i32, serial: i32): void {
  const v = inst.virtuals.get(host);
  if (v !== undefined && v.serial === serial) { virtualPhase(v, VirtualPhase.Closed); inst.virtuals.delete(host); }
  if (serial !== 0 && ui.nodeSerial(host) === serial) ui.destroy(host);
}
const instances: Instance[] = [];
export function __dispose(): void {
  for (const i of instances) { i.hooks = []; i.effects = []; i.render = () => -1; i.kids = []; i.nextKids = []; i.virtuals.clear(); i.comp = null; }
}
let cur: Instance | null = null;
// zinc dev's Fast Refresh (ZN-631; hot mode only): after an update the whole tree renders again with the new code, as React Fast Refresh does:
// hook state is kept, memos and callbacks run again (their old functions are the old code's), every handler is the new code's
let hotPass = false;
let hotRoot: Instance | null = null;
let hotNode: i32 = -1;
/** True once the React engine rendered a component: model-neutral libraries (zinc:ui/kit) then build plain nodes. */
export function _active(): boolean { return instances.length > 0; }

function rerender(inst: Instance): void {
  if (inst.dead || ui.nodeSerial(inst.host) !== inst.serial) return;
  ui.beginChildUpdate();
  inst.index = 0;
  inst.effects = [];
  inst.cursor = 0; inst.kidCursor = 0;
  inst.nextNodes = []; inst.nextTags = []; inst.nextSerials = []; inst.nextKids = [];
  // children are rebuilt by this render; nodes that are not reused are destroyed below
  for (let k = 0; k < inst.nodes.length; k++) if (ui.nodeSerial(inst.nodes[k]) === inst.serials[k]) ui.detachChildren(inst.nodes[k]);
  const prev = cur;
  try {
    cur = inst;
    let node: i32 | null = null;
    try {
      try { node = inst.render(); } finally { cur = prev; }
    } catch (e) {
      for (const kid of inst.nextKids) if (inst.kids.indexOf(kid) < 0) unmount(kid);
      for (let k = 0; k < inst.nextNodes.length; k++) if (inst.nodes.indexOf(inst.nextNodes[k]) < 0) destroyHost(inst, inst.nextNodes[k], inst.nextSerials[k]);
      inst.nextNodes = []; inst.nextTags = []; inst.nextSerials = []; inst.nextKids = [];
      throw e;
    }
    for (let k = inst.cursor; k < inst.nodes.length; k++) destroyHost(inst, inst.nodes[k], inst.serials[k]);
    for (const kid of inst.kids) if (inst.nextKids.indexOf(kid) < 0) unmount(kid);
    if (inst.dead || ui.nodeSerial(inst.host) !== inst.serial) return;
    inst.nodes = inst.nextNodes; inst.tags = inst.nextTags; inst.serials = inst.nextSerials; inst.kids = inst.nextKids;
    ui.detachChildren(inst.host);
    if (node !== null) ui.insert(inst.host, node, -1);
  } finally { ui.endChildUpdate(); }
  for (const e of inst.effects) e();  // useLayoutEffect/useEffect: after the tree is committed
}
function unmount(inst: Instance): void {
  if (inst.dead) return;
  instancePhase(inst, InstancePhase.Unmounting);
  const at = instances.indexOf(inst);
  if (at >= 0) instances.splice(at, 1);
  const jobs: (() => void)[] = [];
  const c = inst.comp;
  if (c !== null) { c.inst = null; jobs.push(() => c.componentWillUnmount()); }
  for (const h of inst.hooks) if (h instanceof EffectHook) { const cleanup = h.cleanup; h.cleanup = null; if (cleanup !== null) jobs.push(cleanup); }
  const kids = inst.kids.slice();
  for (const kid of inst.nextKids) if (kids.indexOf(kid) < 0) kids.push(kid);
  for (const kid of kids) jobs.push(() => unmount(kid));
  const hosts = inst.nodes.concat(inst.nextNodes), serials = inst.serials.concat(inst.nextSerials);
  for (let k = 0; k < hosts.length; k++) {
    const n = hosts[k], serial = serials[k];
    jobs.push(() => destroyHost(inst, n, serial));
  }
  inst.virtuals.forEach((v: VirtualRender) => jobs.push(() => virtualPhase(v, VirtualPhase.Closed)));
  try { disposeAll(jobs); }
  finally {
    inst.virtuals.clear(); inst.nodes = []; inst.tags = []; inst.serials = []; inst.nextNodes = []; inst.nextTags = []; inst.nextSerials = []; inst.hooks = []; inst.kids = []; inst.nextKids = []; inst.render = () => -1; inst.comp = null;
    instancePhase(inst, InstancePhase.Unmounted);
  }
}
function renderChild(inst: Instance, parent: Instance | null): void {
  try { rerender(inst); }
  catch (e) {
    if (parent !== null) { const at = parent.nextKids.indexOf(inst); if (at >= 0) parent.nextKids.splice(at, 1); }
    unmount(inst);
    throw e;
  }
}
/** Next host node of the component being rendered: reused when the previous render had the same tag there. */
function hostNode(tag: i32): i32 {
  const inst = cur;
  if (inst === null) return ui.createNode(tag);
  const k = inst.cursor;
  let n: i32 = -1;
  if (k < inst.nodes.length && inst.tags[k] === tag && ui.nodeSerial(inst.nodes[k]) === inst.serials[k]) { n = inst.nodes[k]; inst.cursor = k + 1; }
  else {
    // mismatch: the rest of the previous render cannot be matched by position
    for (let j = k; j < inst.nodes.length; j++) destroyHost(inst, inst.nodes[j], inst.serials[j]);
    inst.nodes = inst.nodes.slice(0, k); inst.tags = inst.tags.slice(0, k); inst.serials = inst.serials.slice(0, k);
    inst.cursor = k;
    n = ui.createNode(tag);
  }
  inst.nextNodes.push(n); inst.nextTags.push(tag); inst.nextSerials.push(ui.nodeSerial(n));
  return n;
}
function schedule(inst: Instance): void {
  if (inst.scheduled) return;
  inst.scheduled = true;
  queueMicrotask(() => { inst.scheduled = false; rerender(inst); });
}
function instance(): Instance {
  const i = cur;
  if (i === null) throw new Error('hooks can only be called inside a component');
  return i;
}
function depsKey(deps: number[] | null): string { return deps === null ? '\u0001' + Math.random() : deps.join(','); }

export function useState<T>(init: T): [T, (v: T) => void] {
  const inst = instance();
  const i = inst.index++;
  if (i >= inst.hooks.length) inst.hooks.push(new StateHook<T>(init));
  const h = inst.hooks[i] as StateHook<T>;
  return [h.value, (v: T) => { if (h.value === v) return; h.value = v; schedule(inst); }];
}
export function useReducer<S, A>(reducer: (s: S, a: A) => S, init: S): [S, (a: A) => void] {
  const inst = instance();
  const i = inst.index++;
  if (i >= inst.hooks.length) inst.hooks.push(new StateHook<S>(init));
  const h = inst.hooks[i] as StateHook<S>;
  return [h.value, (a: A) => { h.value = reducer(h.value, a); schedule(inst); }];
}
/** Runs `fn` after the render when `deps` changed (null: after every render). What it returns, its cleanup, runs before it runs again and when
 *  the component goes. */
export function useEffect(fn: () => (() => void) | undefined, deps: number[] | null): void {
  const inst = instance();
  const i = inst.index++;
  if (i >= inst.hooks.length) inst.hooks.push(new EffectHook());
  const h = inst.hooks[i] as EffectHook;
  const key = depsKey(deps);
  if (key === h.deps) return;   // not again in a Fast Refresh pass: a second run would stack subscriptions
  h.deps = key;
  inst.effects.push(() => {
    const old = h.cleanup;
    if (old !== null) { h.cleanup = null; old(); }
    const c = fn();
    if (c !== undefined) h.cleanup = c;
  });
}
export function useLayoutEffect(fn: () => (() => void) | undefined, deps: number[] | null): void { useEffect(fn, deps); }
export function useMemo<T>(fn: () => T, deps: number[]): T {
  const inst = instance();
  const i = inst.index++;
  if (i >= inst.hooks.length) inst.hooks.push(new MemoHook<T>(fn()));
  const h = inst.hooks[i] as MemoHook<T>;
  const key = depsKey(deps);
  if (key !== h.deps || hotPass) { h.deps = key; h.value = fn(); }
  return h.value;
}
export function useCallback<T>(fn: T, deps: number[]): T { return useMemo<T>(() => fn, deps); }
export function useRef<T>(v: T): MutableRef<T> {
  const inst = instance();
  const i = inst.index++;
  if (i >= inst.hooks.length) inst.hooks.push(new MutableRef<T>(v));
  return inst.hooks[i] as MutableRef<T>;
}

// ---- JSX lowering helpers ----
export function _el(tag: i32): i32 { return hostNode(tag); }
export function _text(parent: i32, s: string): void { const t = hostNode(ui.TEXT); ui.setText(t, s); ui.insert(parent, t, -1); }
export function _textOf(n: i32, s: string): void { ui.setText(n, s); }
export function _append(parent: i32, child: i32 | null): void { if (child !== null) ui.insert(parent, child, -1); }
/** A dev run's component call (jsx.h devFile): the wrapper node `n` stands for component `name`, called at `src` (file:line) with the props written there. */
export function _cn(n: i32, name: string, src: string, props: string): void { ui.setComponentName(n, name, src, props); }
export function _class(n: i32, c: string): void { ui.setClass(n, c); }
export function _on(n: i32, f: () => void): void { ui.listen(n, f); }
export function _draw(n: i32, f: (x: i32, y: i32, w: i32, h: i32) => void): void { ui.draw(n, f); }
export function _styles(n: i32, styles: ui.Style[]): void { ui.setStyles(n, styles); }
export function _num(n: i32, key: string, v: number): void { ui.setNumber(n, key, v); }
export function _img(n: i32, src: string): void { ui.setImage(n, src); }
export function _imgH(n: i32, img: i32): void { ui.setImageHandle(n, img); }
// text fields and pointer / key events (onChange of a field fires on every edit, like React)
export function _ptr(n: i32, kind: i32, f: (e: ui.PointerEvent) => void): void { ui.onPointer(n, kind, f); }
export function _spread(n: i32, p: ui.PanHandlers): void { p.attach(n); }   // {...pan.panHandlers}
export function _scroll(n: i32, f: ui.ResponderHandler): void { ui.onScroll(n, f, true); }
export function _flat(styles: ui.Style[]): ui.Style { return ui.StyleSheet.flatten(styles); }   // style props of zinc:react-native components
export function _key(n: i32, f: (e: ui.KeyEvent) => void): void { ui.onKeyDown(n, f); }
export function _keyUp(n: i32, f: (e: ui.KeyEvent) => void): void { ui.onNodeKeyUp(n, f); }
export function _ctx(n: i32, c: string): void { ui.keyContext(n, c); }
export function _submit(n: i32, f: () => void): void { ui.onSubmit(n, f); }   // <Form onSubmit>
export function _onText(n: i32, change: boolean, f: (v: string) => void): void { ui.onText(n, change, f); }
export function _str(n: i32, key: string, s: string): void { if (key === 'value') ui.setValue(n, s); else if (key === 'role') ui.setRole(n, s); else if (key === 'label') ui.setLabel(n, s); else if (key === 'scrollKey') ui.setScrollKey(n, s); else if (key.startsWith('attr:')) ui.setAttr(n, key.slice(5), s); else ui.setPlaceholder(n, s); }
export function _hl(n: i32, f: (line: string) => i32[]): void { ui.setHighlight(n, f); }
/** <VirtualList count itemHeight>{(i) => ...}</VirtualList>: visible rows only; rows re-render when the list re-renders. */
export function _virtual(n: i32, count: i32, itemH: number, render: (i: i32) => i32): void {
  const parent = cur;
  let state = parent === null ? undefined : parent.virtuals.get(n);
  if (state !== undefined && state.serial !== ui.nodeSerial(n)) { virtualPhase(state, VirtualPhase.Closed); state = undefined; }
  if (state !== undefined && state.phase === VirtualPhase.Mounted && state.count === count && state.itemH === itemH) {
    state.render = render;
    const owner = state;
    const hosts = owner.rows.keys();
    for (const host of hosts) {
      const row = owner.rows.get(host);
      if (row === undefined) continue;
      if (ui.nodeSerial(host) !== row.serial) { ui.invalidateVirtualRow(n, host, row.serial); dropRow(owner, host); continue; }
      rerender(row); ui.insert(n, host, -1);
    }
    return;
  }
  if (state !== undefined) virtualPhase(state, VirtualPhase.Closed);
  const owner = new VirtualRender(n, count, itemH, render);
  if (parent !== null) parent.virtuals.set(n, owner);
  ui.virtualize(n, count, itemH, (i: i32) => {
    if (owner.phase !== VirtualPhase.Mounted || ui.nodeSerial(n) !== owner.serial) throw new Error('virtual list is no longer mounted');
    const host = ui.createNode(ui.FRAGMENT);
    const row = new Instance(host, () => owner.render(i), '_row', String(i));
    owner.rows.set(host, row);
    try { rerender(row); }
    catch (e) { dropRow(owner, host); ui.destroy(host); throw e; }
    return host;
  }, (host: i32) => dropRow(owner, host));
}
/** The component instances a virtual list's row made, unmounted when the row scrolls out or the list renders again (they were kept for
 *  good: scrolling a long list grew the memory without end). */
function dropRow(owner: VirtualRender, host: i32): void {
  const row = owner.rows.get(host);
  if (row === undefined) return;
  owner.rows.delete(host);
  unmount(row);
}
export function _focusable(n: i32): void { ui.setFocusable(n, true); }
export function _ref(n: i32, r: MutableRef<i32>): void { r.current = n; }
/** Class components (Inferno, React classes): state lives on the instance, setState re-renders it. */
export class ComponentBase {
  inst: Instance | null = null;
  render(): i32 { return -1; }
  componentDidMount(): void {}
  componentDidUpdate(): void {}
  componentWillUnmount(): void {}
  forceUpdate(): void { const i = this.inst; if (i !== null) schedule(i); }
  /** Takes the props of a freshly built element for the same component (re-render of the parent). */
  adopt(fresh: ComponentBase): void {}
}
export class Component<P, S> extends ComponentBase {
  props: P;
  state!: S;
  constructor(props: P) { super(); this.props = props; }
  /** Replaces the state (pass the whole state; `{ ...this.state, x }` for partial updates). */
  setState(s: S): void { this.state = s; this.forceUpdate(); }
  adopt(fresh: ComponentBase): void { this.props = (fresh as Component<P, S>).props; }
}
/** `<Counter ... />` where Counter is a class: the instance is created once and receives fresh props on re-render. */
export function _cc(host: i32, make: () => ComponentBase, name: string, key: string): void {
  const parent = cur;
  let inst: Instance | null = null;
  if (parent !== null) {
    for (const k of parent.kids) if (k.name === name && k.key === key && k.comp !== null && parent.nextKids.indexOf(k) < 0 && (key !== '' || parent.kids.indexOf(k) >= parent.kidCursor)) { inst = k; break; }
    parent.kidCursor++;
  }
  const fresh = make();
  let mounted = true;
  if (inst === null) {
    const c = fresh;
    inst = new Instance(host, () => c.render(), name, key);
    inst.comp = c; c.inst = inst;
    if (parent === null) { const root = inst; ui.onDestroy(host, () => unmount(root)); }
    mounted = false;
  } else {
    inst.host = host; inst.serial = ui.nodeSerial(host);
    (inst.comp as ComponentBase).adopt(fresh);
  }
  if (parent !== null) parent.nextKids.push(inst);
  renderChild(inst, parent);
  const c = inst.comp as ComponentBase;
  if (mounted) c.componentDidUpdate(); else queueMicrotask(() => c.componentDidMount());
}
/** Inferno's linkEvent: an event handler bound to a value. */
export function linkEvent<T>(data: T, fn: (data: T) => void): () => void { return () => fn(data); }

/** A component instance: renders into `host` (a fragment) and re-renders on state changes. Inside a parent render,
 *  the previous instance with the same component name and key keeps its state. */
export function _rc(host: i32, render: () => i32 | null, name: string = '', key: string = ''): void {
  const parent = cur;
  let inst: Instance | null = null;
  if (parent !== null) {
    for (const k of parent.kids) if (k.name === name && k.key === key && parent.nextKids.indexOf(k) < 0 && (key !== '' || parent.kids.indexOf(k) >= parent.kidCursor)) { inst = k; break; }
    parent.kidCursor++;
  }
  if (inst === null) {
    inst = new Instance(host, render, name, key);
    if (parent === null) { const root = inst; ui.onDestroy(host, () => unmount(root)); }
  }
  else { inst.host = host; inst.serial = ui.nodeSerial(host); inst.render = render; }
  if (parent !== null) parent.nextKids.push(inst);
  renderChild(inst, parent);
}
/** The props of a component, evaluated once where it is written (as React does) and typed by the component (the JSX lowering: a prop
 *  that reads a value narrowed there, `m.reply !== null ? <Reply m={m.reply} /> : null`, keeps the narrowing). */
export function _props<P, R>(component: (p: P) => R, p: P): P { return p; }
export function render(app: () => i32, background: i32, onTick: ((dt: number) => void) | null): void {
  const root = ui.createNode(ui.VIEW);
  const host = ui.createNode(ui.FRAGMENT);
  ui.insert(root, host, -1);
  const first = instances.length;   // the root instance comes first, its children after it
  _rc(host, () => app(), 'App', '');
  if (import.meta.hot) {   // zinc dev: the entry running again replaces the tree it mounted; an update renders the tree again
    const last = hotRoot;
    if (last !== null) { unmount(last); ui.destroy(hotNode); }
    else import.meta.hot.on('afterUpdate', (_modules: string[]): void => {
      const r = hotRoot;
      if (r === null) return;
      hotPass = true;
      rerender(r);
      hotPass = false;
    });
    hotRoot = instances[first];
    hotNode = root;
  }
  ui.mount(root, background, onTick);
}

/** Marker for `<VirtualList count itemHeight>{(i) => ...}</VirtualList>` (lowered by the JSX compiler). */
export const VirtualList: i32 = 2;
