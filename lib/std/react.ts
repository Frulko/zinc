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

class Instance {
  hooks: Hook[] = [];
  index: i32 = 0;
  host: i32;
  render: () => i32;
  scheduled: boolean = false;
  effects: (() => void)[] = [];
  name: string;
  key: string;
  // reconciliation state: host nodes and child instances of the last render, in creation order
  nodes: i32[] = [];
  tags: i32[] = [];
  kids: Instance[] = [];
  nextNodes: i32[] = [];
  nextTags: i32[] = [];
  nextKids: Instance[] = [];
  cursor: i32 = 0;
  kidCursor: i32 = 0;
  comp: ComponentBase | null = null;  // class components (Inferno/React classes)
  constructor(host: i32, render: () => i32, name: string, key: string) { this.host = host; this.render = render; this.name = name; this.key = key; instances.push(this); }
}
const instances: Instance[] = [];
export function __dispose(): void {
  for (const i of instances) { i.hooks = []; i.effects = []; i.render = () => -1; i.kids = []; i.nextKids = []; i.comp = null; }
}
let cur: Instance | null = null;
/** True once the React engine rendered a component: model-neutral libraries (zinc:ui/kit) then build plain nodes. */
export function _active(): boolean { return instances.length > 0; }

function rerender(inst: Instance): void {
  inst.index = 0;
  inst.effects = [];
  inst.cursor = 0; inst.kidCursor = 0;
  inst.nextNodes = []; inst.nextTags = []; inst.nextKids = [];
  // children are rebuilt by this render; nodes that are not reused are destroyed below
  for (const n of inst.nodes) ui.detachChildren(n);
  const prev = cur;
  cur = inst;
  const node = inst.render();
  cur = prev;
  for (let k = inst.cursor; k < inst.nodes.length; k++) ui.destroy(inst.nodes[k]);
  for (const kid of inst.kids) if (inst.nextKids.indexOf(kid) < 0) unmount(kid);
  inst.nodes = inst.nextNodes; inst.tags = inst.nextTags; inst.kids = inst.nextKids;
  ui.detachChildren(inst.host);
  ui.insert(inst.host, node, -1);
  for (const e of inst.effects) e();  // useLayoutEffect/useEffect: after the tree is committed
}
function unmount(inst: Instance): void {
  const c = inst.comp;
  if (c !== null) { c.componentWillUnmount(); c.inst = null; }
  for (const h of inst.hooks) if (h instanceof EffectHook) { const c = h.cleanup; if (c !== null) c(); }
  for (const kid of inst.kids) unmount(kid);
  inst.hooks = []; inst.kids = []; inst.render = () => -1;
}
/** Next host node of the component being rendered: reused when the previous render had the same tag there. */
function hostNode(tag: i32): i32 {
  const inst = cur;
  if (inst === null) return ui.createNode(tag);
  const k = inst.cursor;
  let n: i32 = -1;
  if (k < inst.nodes.length && inst.tags[k] === tag) { n = inst.nodes[k]; inst.cursor = k + 1; }
  else {
    // mismatch: the rest of the previous render cannot be matched by position
    for (let j = k; j < inst.nodes.length; j++) ui.destroy(inst.nodes[j]);
    inst.nodes = inst.nodes.slice(0, k); inst.tags = inst.tags.slice(0, k);
    inst.cursor = k;
    n = ui.createNode(tag);
  }
  inst.nextNodes.push(n); inst.nextTags.push(tag);
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
export function useEffect(fn: () => void, deps: number[] | null): void {
  const inst = instance();
  const i = inst.index++;
  if (i >= inst.hooks.length) inst.hooks.push(new EffectHook());
  const h = inst.hooks[i] as EffectHook;
  const key = depsKey(deps);
  if (key === h.deps) return;
  h.deps = key;
  inst.effects.push(fn);
}
export function useLayoutEffect(fn: () => void, deps: number[] | null): void { useEffect(fn, deps); }
export function useMemo<T>(fn: () => T, deps: number[]): T {
  const inst = instance();
  const i = inst.index++;
  if (i >= inst.hooks.length) inst.hooks.push(new MemoHook<T>(fn()));
  const h = inst.hooks[i] as MemoHook<T>;
  const key = depsKey(deps);
  if (key !== h.deps) { h.deps = key; h.value = fn(); }
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
export function _append(parent: i32, child: i32): void { ui.insert(parent, child, -1); }
export function _class(n: i32, c: string): void { ui.setClass(n, c); }
export function _on(n: i32, f: () => void): void { ui.listen(n, f); }
export function _draw(n: i32, f: (x: i32, y: i32, w: i32, h: i32) => void): void { ui.draw(n, f); }
export function _styles(n: i32, styles: ui.Style[]): void { ui.setStyles(n, styles); }
export function _num(n: i32, key: string, v: number): void { ui.setNumber(n, key, v); }
export function _img(n: i32, src: string): void { ui.setImage(n, src); }
// text fields and pointer / key events (onChange of a field fires on every edit, like React)
export function _ptr(n: i32, kind: i32, f: (e: ui.PointerEvent) => void): void { ui.onPointer(n, kind, f); }
export function _spread(n: i32, p: ui.PanHandlers): void { p.attach(n); }   // {...pan.panHandlers}
export function _scroll(n: i32, f: ui.ResponderHandler): void { ui.onScroll(n, f); }
export function _key(n: i32, f: (e: ui.KeyEvent) => void): void { ui.onKeyDown(n, f); }
export function _ctx(n: i32, c: string): void { ui.keyContext(n, c); }
export function _onText(n: i32, change: boolean, f: (v: string) => void): void { ui.onText(n, change, f); }
export function _str(n: i32, key: string, s: string): void { if (key === 'value') ui.setValue(n, s); else if (key === 'role') ui.setRole(n, s); else if (key === 'label') ui.setLabel(n, s); else if (key.startsWith('attr:')) ui.setAttr(n, key.slice(5), s); else ui.setPlaceholder(n, s); }
export function _hl(n: i32, f: (line: string) => i32[]): void { ui.setHighlight(n, f); }
/** <VirtualList count itemHeight>{(i) => ...}</VirtualList>: visible rows only; rows re-render when the list re-renders. */
export function _virtual(n: i32, count: i32, itemH: number, render: (i: i32) => i32): void {
  const prev = cur;
  cur = null;  // rows are built outside this component's reconciliation (they come and go with scrolling)
  ui.virtualize(n, count, itemH, (i: i32) => { const p = cur; cur = null; const r = render(i); cur = p; return r; }, null);
  cur = prev;
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
    mounted = false;
  } else {
    inst.host = host;
    (inst.comp as ComponentBase).adopt(fresh);
  }
  if (parent !== null) parent.nextKids.push(inst);
  rerender(inst);
  const c = inst.comp as ComponentBase;
  if (mounted) c.componentDidUpdate(); else queueMicrotask(() => c.componentDidMount());
}
/** Inferno's linkEvent: an event handler bound to a value. */
export function linkEvent<T>(data: T, fn: (data: T) => void): () => void { return () => fn(data); }

/** A component instance: renders into `host` (a fragment) and re-renders on state changes. Inside a parent render,
 *  the previous instance with the same component name and key keeps its state. */
export function _rc(host: i32, render: () => i32, name: string = '', key: string = ''): void {
  const parent = cur;
  let inst: Instance | null = null;
  if (parent !== null) {
    for (const k of parent.kids) if (k.name === name && k.key === key && parent.nextKids.indexOf(k) < 0 && (key !== '' || parent.kids.indexOf(k) >= parent.kidCursor)) { inst = k; break; }
    parent.kidCursor++;
  }
  if (inst === null) inst = new Instance(host, render, name, key);
  else { inst.host = host; inst.render = render; }
  if (parent !== null) parent.nextKids.push(inst);
  rerender(inst);
}
export function render(app: () => i32, background: i32, onTick: ((dt: number) => void) | null): void {
  const root = ui.createNode(ui.VIEW);
  const host = ui.createNode(ui.FRAGMENT);
  ui.insert(root, host, -1);
  _rc(host, app, 'App', '');
  ui.mount(root, background, onTick);
}

/** Marker for `<VirtualList count itemHeight>{(i) => ...}</VirtualList>` (lowered by the JSX compiler). */
export const VirtualList: i32 = 2;
