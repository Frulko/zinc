// zinc:ui/react — React model (D-12, UI-04): function components and hooks. A component re-renders as a whole
// when its state changes and replaces its host subtree (ponytail: no keyed diff yet). Hook order is checked at build.
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
  constructor(host: i32, render: () => i32) { this.host = host; this.render = render; instances.push(this); }
}
const instances: Instance[] = [];
export function __dispose(): void {
  for (const i of instances) { i.hooks = []; i.effects = []; i.render = () => -1; }
}
let cur: Instance | null = null;

function rerender(inst: Instance): void {
  inst.index = 0;
  inst.effects = [];
  const prev = cur;
  cur = inst;
  const node = inst.render();
  cur = prev;
  ui.clearChildren(inst.host);
  ui.insert(inst.host, node, -1);
  for (const e of inst.effects) e();  // useLayoutEffect/useEffect: after the tree is committed
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
export function _el(tag: i32): i32 { return ui.createNode(tag); }
export function _text(parent: i32, s: string): void { ui.insert(parent, ui.createText(s), -1); }
export function _textOf(n: i32, s: string): void { ui.setText(n, s); }
export function _append(parent: i32, child: i32): void { ui.insert(parent, child, -1); }
export function _class(n: i32, c: string): void { ui.setClass(n, c); }
export function _on(n: i32, f: () => void): void { ui.listen(n, f); }
export function _draw(n: i32, f: (x: i32, y: i32, w: i32, h: i32) => void): void { ui.draw(n, f); }
export function _num(n: i32, key: string, v: number): void { ui.setNumber(n, key, v); }
export function _img(n: i32, src: string): void { ui.setImage(n, src); }
export function _focusable(n: i32): void { ui.setFocusable(n, true); }
export function _ref(n: i32, r: MutableRef<i32>): void { r.current = n; }
/** A component instance: renders into `host` (a fragment) and re-renders on state changes. */
export function _rc(host: i32, render: () => i32): void { rerender(new Instance(host, render)); }
export function render(app: () => i32, background: i32, onTick: ((dt: number) => void) | null): void {
  const root = ui.createNode(ui.VIEW);
  const host = ui.createNode(ui.FRAGMENT);
  ui.insert(root, host, -1);
  _rc(host, app);
  ui.mount(root, background, onTick);
}
