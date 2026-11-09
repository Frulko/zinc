/** @jsxHelpers zinc:ui/kit/host */
import { Show, For, NodeRef } from 'zinc:ui/solid';
import { componentRef, componentMemo, componentEffect } from 'zinc:ui/kit/host';
import { state, mounted } from './model';
export const values = new Map<string, () => i32>();
export const changes = new Map<string, (value: i32) => void>();
export const cleanups = new Map<string, i32>();
export const mounts = new Map<string, i32>();
export const fields = new Map<string, NodeRef>();
export const renders = new Map<string, i32>();
export const memos = new Map<string, () => i32>();
export const effects = new Map<string, i32>();
export const effectCleanups = new Map<string, i32>();
export const list = new NodeRef();
function add(map: Map<string, i32>, id: string): void { map.set(id, (map.get(id) ?? 0) + 1); }
function Stateful(p: { id: string, edited?: () => void }): i32 {
  const [value, setValue] = state<i32>(0);
  const twice = componentMemo<i32>(() => value() * 2, 0); memos.set(p.id, twice);
  componentEffect(() => { const current = value(); add(effects, p.id); return () => { add(effectCleanups, p.id); }; }, [value()]);
  values.set(p.id, value); changes.set(p.id, setValue); add(renders, p.id);
  mounted(() => { add(mounts, p.id); return () => { add(cleanups, p.id); }; });
  const ref = componentRef(new NodeRef()); fields.set(p.id, ref.current);
  return <View><Text>{p.id + ':' + value()}</Text><Input ref={ref.current} value={String(value())} onInput={(text: string) => { setValue(Number(text) as i32); const edit = p.edited; if (edit !== undefined) edit(); }} /></View>;
}
export function Body(p: { shown: () => boolean, order: () => string[], edited: () => void, virtual: () => boolean }): i32 {
  return <View className="grow">
    <Show when={p.shown()}><Stateful id="first" /></Show>
    <Stateful id="second" />
    <For each={p.order()}>{(id: string) => <Stateful key={id} id={id} />}</For>
    <Show when={p.virtual()}><VirtualList ref={list} count={100} itemHeight={40} className="h-[120] shrink-0">{(i: i32) => <Stateful id={'row-' + i} edited={p.edited} />}</VirtualList></Show>
  </View>;
}
export function Branch(p: { when: () => boolean }): i32 { return <Show when={p.when()} fallback={<Stateful id="else" />}><Stateful id="then" /></Show>; }
