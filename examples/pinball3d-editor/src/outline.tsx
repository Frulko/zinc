// The list at the left: everything a table file holds, by the lists and the objects of the format. A click selects; the panel at the
// right then shows its properties. What has a place is also on the top view; what has none (surfaces, looks, sounds, the physics, the
// rules) is reached from here. The lists are read from the schema: a list added to the format gets its line.
// The box at the top goes to a thing by its name, or by its path in the file (Cmd+G).
import { createSignal, createNodeRef, createEffect, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { doc, selected, select, goTo, PLACED_LISTS, PLACED_OBJECTS, OTHER_LISTS, OTHER_OBJECTS } from './state';
import { listOf } from './doc';
import { rgb } from './shapes';
import { Ico, Heading, MUTED, chord } from './widgets';
import * as L from './strings';
import { t, f, listName } from './strings';

const goer = createNodeRef();
/** Puts the caret in the box that goes to a thing (Cmd+G). */
export function focusGoTo(): void { if (goer.node >= 0) { ui.focusNode(goer.node); ui.select(goer.node, 0, ui.getValue(goer.node).length); } }

/** The lists that are unfolded: their names between bars. */
const [unfolded, setUnfolded] = createSignal<string>('|');
function isOpen(list: string): boolean { return unfolded().indexOf(`|${list}|`) >= 0; }
function toggle(list: string): void { setUnfolded(isOpen(list) ? unfolded().replaceAll(`|${list}|`, '|') : `${unfolded()}${list}|`); }

function Line(p: { path: string; label: () => string; inset: boolean; dot: () => string }): i32 {
  const on = (): boolean => selected() === p.path;
  return <button class={`flex-row items-center justify-start gap-2 h-6 pr-2 rounded cursor-pointer ${p.inset ? 'pl-7' : 'pl-2'} ${on() ? 'bg-amber-400' : 'bg-zinc-900 hover:bg-zinc-800'}`} onClick={() => select(p.path)}>
    <Show when={p.dot().length === 7}><view class="w-[9] h-[9] rounded-full border border-zinc-600" style={{ bg: p.dot().length === 7 ? rgb(p.dot()) : 0 }} /></Show>
    <text class={`truncate text-xs ${on() ? 'font-bold text-zinc-900' : 'text-zinc-200'}`} style={{ maxWidth: 170 }}>{p.label()}</text>
  </button>;
}
/** A list of the table: its name and how many it holds; unfolded, a line per item. */
function Group(p: { list: string }): i32 {
  const list = p.list;
  const count = (): i32 => { const v: any = doc().get(list); return v === undefined ? 0 : v.length; };
  // "2 pop3": the place of an item and its name; the rows are made again when a name or the order changes
  const rows = (): string[] => {
    const v: any = doc().get(list), out: string[] = [];
    if (v !== undefined) for (let i = 0; i < v.length; i++) out.push(`${i} ${v[i].id}`);
    return out;
  };
  const colour = (i: string): string => { const c: any = doc().get(`${list}[${i}].color`); return typeof c === 'string' ? `${c}` : ''; };
  return <view class="flex-col">
    <button class="flex-row items-center justify-start gap-1 h-6 px-1 rounded cursor-pointer bg-zinc-900 hover:bg-zinc-800" onClick={() => toggle(list)}>
      <Show when={isOpen(list)}><Ico name="chevron-down" size={12} color={MUTED} /></Show>
      <Show when={!isOpen(list)}><Ico name="chevron-right" size={12} color={MUTED} /></Show>
      <text class={`grow truncate text-xs ${count() === 0 ? 'text-zinc-500' : 'text-zinc-200'}`} style={{ maxWidth: 160 }}>{listName(list, false)}</text>
      <text class="text-[11px] text-zinc-500">{`${count()}`}</text>
    </button>
    <Show when={isOpen(list)}>
      <view class="flex-col">
        <For each={rows()}>{(row: string, i: i32) => {
          const cut = row.indexOf(' '), at = row.slice(0, cut);
          return <Line path={`${list}[${at}]`} label={() => row.slice(cut + 1)} inset={true} dot={() => colour(at)} />;
        }}</For>
      </view>
    </Show>
  </view>;
}
function Section(p: { label: string; children: () => i32 }): i32 {
  return <view class="flex-col gap-[1] px-2 pb-3">
    <view class="px-2 h-6 justify-center"><Heading label={p.label} /></view>
    {p.children()}
  </view>;
}
const noDot = (): string => '';
export function Outline(): i32 {
  // what is selected on the top view is shown in its list
  createEffect(() => { const list = listOf(selected()); if (list !== '' && !isOpen(list)) setUnfolded(`${unfolded()}${list}|`); });
  return <view class="w-[236] shrink-0 flex-col bg-zinc-900 border-r border-zinc-800">
    <view class="flex-row items-center gap-2 h-10 px-3 shrink-0 border-b border-zinc-800">
      <Ico name="search" size={13} color={MUTED} />
      <input ref={goer} style={{ width: 184 }} class="h-7 px-2 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-amber-400" placeholder={f(L.GO_TO, chord('G'))}
        onChange={(v: string) => { if (goTo(v)) ui.setValue(goer.node, ''); }} />
    </view>
    <scroll class="grow basis-0 min-h-0 flex-col pt-3">
      <Section label={t(L.CONTENTS)}>
        <Line path="" label={() => t(L.THE_TABLE)} inset={false} dot={noDot} />
        {OTHER_OBJECTS.map((name: string, i: i32) => <Line path={name} label={() => listName(name, false)} inset={false} dot={noDot} />)}
      </Section>
      <Section label={t(L.ON_THE_TABLE)}>
        {PLACED_OBJECTS.map((name: string, i: i32) => <Line path={name} label={() => listName(name, false)} inset={false} dot={noDot} />)}
        {PLACED_LISTS.map((list: string, i: i32) => <Group list={list} />)}
      </Section>
      <Section label={t(L.MATERIALS)}>
        {OTHER_LISTS.map((list: string, i: i32) => <Group list={list} />)}
      </Section>
    </scroll>
  </view>;
}
