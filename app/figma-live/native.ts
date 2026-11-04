// Native semantic controls are chosen by an explicit Figma component-key contract.
import * as ui from 'zinc:ui';
import { Slider, Switch } from 'zinc:ui/kit';
import { createSignal, createSubtree, Subtree, _virtual as virtualRows, onCleanup } from 'zinc:ui/solid';
import { Layer } from './model';
export class BindingEvent { key: string = ''; outlet: string = ''; nodeId: string = ''; kind: string = ''; value: number = 0; }
class Value { key: string = ''; get: () => number; set: (value: number) => void; constructor(key: string, value: number) { this.key = key; const [get, set] = createSignal<number>(value); this.get = get; this.set = (v: number): void => { set(v); }; } }
class Rows { key: string = ''; count: () => number; row: (index: i32) => i32; drop: ((node: i32) => void) | null; constructor(key: string, count: () => number, row: (index: i32) => i32, drop: ((node: i32) => void) | null) { this.drop = drop; this.key = key; this.count = count; this.row = row; } }
export class NativeControls {
  changed: ((event: BindingEvent) => void) | null = null;
  private values: Value[] = [];
  private rows: Rows[] = [];
  private roots: Subtree[] = [];
  setValue(key: string, value: number): boolean { for (const v of this.values) if (v.key === key) { v.set(value); return true; } return false; }
  value(key: string): number { for (const v of this.values) if (v.key === key) return v.get(); return 0; }
  registerList(key: string, count: () => number, row: (index: i32) => i32, drop: ((node: i32) => void) | null = null): void {
    for (const r of this.rows) if (r.key === key) { r.count = count; r.row = row; r.drop = drop; return; }
    this.rows.push(new Rows(key, count, row, drop));
  }
  private state(key: string, initial: number): Value { for (const v of this.values) if (v.key === key) return v; const v = new Value(key, initial); this.values.push(v); return v; }
  build(n: Layer): i32 {
    const c = n.native;
    if (c.kind === '') return -1;
    if (c.kind === 'ScrollView') { const h = ui.createNode(ui.SCROLL); ui.setNumber(h, 'stickToBottom', c.stickToBottom ? 1 : 0); return h; }
    if (c.kind === 'VirtualList') {
      const h = ui.createNode(ui.SCROLL);
      for (const r of this.rows) if (r.key === c.items) {
        const scope = createSubtree((): i32 => { virtualRows(h,r.count,c.itemHeight,(index: i32): i32 => { const node=r.row(index);onCleanup((): void => { if(r.drop!==null)(r.drop as (node:i32)=>void)(node); });return node; }); return h; });
        this.roots.push(scope); return h;
      }
      const text = ui.createNode(ui.TEXT); ui.setText(text, 'Source de données : ' + c.items); ui.insert(h, text, -1); return h;
    }
    const key = c.outlet !== '' ? c.outlet : n.id;
    const state = this.state(key, c.value);
    const change = (value: number): void => {
      state.set(value);
      const e = new BindingEvent(); e.key = c.event !== '' ? c.event : n.codeName + '.change'; e.outlet = key; e.nodeId = n.id; e.kind = c.kind; e.value = value;
      if (this.changed !== null) (this.changed as (event: BindingEvent) => void)(e);
    };
    const scope = createSubtree((): i32 => c.kind === 'Slider'
      ? Slider({value:state.get,onChange:change,min:c.min,max:c.max,step:c.step,className:'w-full'})
      : Switch({checked:(): boolean => state.get() !== 0,onChange:(value: boolean): void => change(value ? 1 : 0)}));
    this.roots.push(scope);
    if (c.kind === 'Switch' && ui.childCount(scope.node) > 0) ui.setLabel(ui.childAt(scope.node, 0), n.name);
    else ui.setLabel(scope.node, n.name);
    const wrapper = ui.createNode(ui.VIEW); ui.insert(wrapper, scope.node, -1); return wrapper;
  }
  unmount(): void { for (const root of this.roots) root.dispose(); this.roots = []; }
  reset(): void { this.unmount(); this.values = []; }
}
