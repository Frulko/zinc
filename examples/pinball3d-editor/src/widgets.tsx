// The small parts the panels of the editor share: icons, buttons, a segmented choice, a list to choose from, a switch.
// Ico, Tool, Action, Segmented, Heading, the colours and DRAWN are copied from the museum editor (examples/museum-table/editor/widgets.tsx,
// D76): the two editors look alike on purpose. A module shared by both is proposed as a follow-up of ZN-649.04.
import { createNodeRef, createSignal, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { platform } from 'zinc:sys';
import { icon } from 'zinc:icons';
import { Svg } from 'zinc:svg';

/** The colours of the editor's chrome (Tailwind's zinc greys, amber for what is selected or primary). */
export const ACCENT: i32 = 0xfbbf24, INK: i32 = 0xf4f4f5, MUTED: i32 = 0xa1a1aa, DANGER: i32 = 0xf87171, WARN: i32 = 0xfb923c, DARK: i32 = 0x18181b;

// ponytail: a program draws the characters of its own sources and of its assets' text files, and an editor shows texts that are in
// neither (a name typed in a field, a table opened from a folder). Until fonts can be asked at run time (ZN-669) this constant puts
// Latin-1, Latin Extended-A and typographic punctuation into the font; a character outside them draws as a missing glyph.
export const DRAWN = '¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ‘’‚“”„†‡•…‰′″‹›€™–—−×÷≠≤≥°';

/** A shortcut as the platform writes it: "⌘S" on a Mac, "Ctrl+S" elsewhere. */
const MAC = platform() === 'macos';
export function chord(k: string, shift: boolean = false): string { return MAC ? `${shift ? '⇧' : ''}⌘${k}` : `Ctrl+${shift ? 'Shift+' : ''}${k}`; }

/** A Lucide icon that is drawn only when the window repaints (zinc:icons' own Icon keeps the window repainting every frame). */
export function Ico(p: { name: string; size: number; color: i32 }): i32 {
  return <canvas class="shrink-0" style={{ width: p.size, height: p.size, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const s = icon(p.name, p.color, 2);
    if (s !== null) (s as Svg).draw(x, y, w, h, 255);
  }} />;
}
/** A button of the top bar: an icon and a word ('' for the icon alone). `off`: shown dimmed (nothing to undo); `look`: 'plain', 'primary'
 *  or 'quiet'; `keys`: its shortcut, shown in the advanced mode ('' for none). */
export function Tool(p: { icon: string; label: string; look: string; keys: () => string; off: () => boolean; onClick: () => void }): i32 {
  const fill = p.look === 'primary' ? 'bg-amber-400 hover:bg-amber-300 active:bg-amber-500' : p.look === 'quiet' ? 'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600';
  return <button class={`flex-row items-center gap-[6] h-8 px-[10] rounded-md cursor-pointer ${fill} ${p.off() ? 'opacity-40' : ''}`} onClick={p.onClick}>
    <Ico name={p.icon} size={15} color={p.look === 'primary' ? DARK : INK} />
    {p.label.length > 0 ? <text class={`text-xs font-bold ${p.look === 'primary' ? 'text-zinc-900' : 'text-zinc-100'}`}>{p.label}</text> : <view />}
    <text class="text-[10px] text-zinc-500">{p.keys()}</text>
  </button>;
}
/** A button of a panel, as wide as its row. `look`: 'plain', 'primary' or 'danger'. */
export function Action(p: { icon: string; label: string; look: string; onClick: () => void }): i32 {
  const fill = p.look === 'danger' ? 'bg-zinc-900 border-red-900 hover:bg-red-950' : p.look === 'primary' ? 'bg-amber-400 border-amber-400 hover:bg-amber-300' : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800';
  return <button class={`grow flex-row items-center justify-center gap-[6] h-8 px-3 rounded-md cursor-pointer border ${fill}`} onClick={p.onClick}>
    <Ico name={p.icon} size={14} color={p.look === 'danger' ? DANGER : p.look === 'primary' ? DARK : INK} />
    <text class={`text-xs font-bold ${p.look === 'danger' ? 'text-red-400' : p.look === 'primary' ? 'text-zinc-900' : 'text-zinc-100'}`}>{p.label}</text>
  </button>;
}
/** One of a few choices, all visible. */
export function Segmented(p: { options: string[]; labels: string[]; value: () => string; onPick: (v: string) => void }): i32 {
  return <view class="flex-row gap-[2] p-[2] rounded-md bg-zinc-950 border border-zinc-800">
    {p.options.map((o: string, i: i32) => <button class={`grow flex-row items-center justify-center h-6 px-2 rounded cursor-pointer ${p.value() === o ? 'bg-zinc-700' : 'bg-zinc-950 hover:bg-zinc-800'}`} onClick={() => p.onPick(o)}>
      <text class={`text-xs ${p.value() === o ? 'font-bold text-white' : 'text-zinc-400'}`}>{p.labels[i]}</text>
    </button>)}
  </view>;
}
/** The small capital heading of a group of a panel. */
export function Heading(p: { label: string }): i32 {
  return <text class="text-[11px] font-bold text-zinc-500" style={{ letterSpacing: 0.6 }}>{p.label.toUpperCase()}</text>;
}

/** One of many choices: a field that opens a list under it. `options` is read when the list opens (the names of the table change);
 *  `labels` gives what is shown for each. A long list (the elements of a table) opens with a box to type in: the list keeps what
 *  holds the text, and Enter takes the first. */
export function Chooser(p: { value: () => string; options: () => string[]; label: (v: string) => string; onPick: (v: string) => void }): i32 {
  const field = createNodeRef(), list = createNodeRef(), search = createNodeRef();
  const [open, setOpen] = createSignal<boolean>(false);
  const [typed, setTyped] = createSignal<string>('');
  const [long, setLong] = createSignal<boolean>(false);
  const close = (): void => { if (open()) { setOpen(false); ui.setNumber(list.node, 'hidden', 1); } };
  const toggle = (): void => {
    if (open()) { close(); return; }
    setTyped('');
    setLong(p.options().length > 10);
    setOpen(true);
    ui.setNumber(list.node, 'hidden', 0);
    if (long()) queueMicrotask(() => { if (search.node >= 0) { ui.setValue(search.node, ''); ui.focusNode(search.node); } });
  };
  const shown = (): string[] => {
    if (!open()) return [];
    const want = typed().trim().toLowerCase();
    return want === '' ? p.options() : p.options().filter((o: string) => o.toLowerCase().indexOf(want) >= 0 || p.label(o).toLowerCase().indexOf(want) >= 0);
  };
  const node = <view class="w-full flex-col">
    <button ref={field} class="w-full flex-row items-center justify-start gap-2 h-7 px-2 rounded-md cursor-pointer bg-zinc-950 border border-zinc-700 hover:border-zinc-500" onClick={toggle}>
      <text class="grow truncate text-xs text-zinc-100" style={{ maxWidth: 122 }}>{p.label(p.value())}</text>
      <Ico name="chevron-down" size={12} color={MUTED} />
    </button>
    <view ref={list} hidden={1} class="flex-col gap-1 p-1 rounded-md bg-zinc-900 border border-zinc-600 shadow-lg" style={{ width: 190 }}>
      <Show when={long()}>
        <input ref={search} class="h-7 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 focus:border-amber-400" style={{ width: 180 }}
          onInput={(v: string) => setTyped(v)} onChange={(v: string) => { const all = shown(); if (open() && all.length > 0) { close(); p.onPick(all[0]); } }} />
      </Show>
      <scroll class="flex-col" style={{ maxHeight: 264 }}>
        <For each={shown()}>{(o: string, i: i32) => <button
          class={`flex-row items-center justify-start h-6 px-2 rounded cursor-pointer ${p.value() === o ? 'bg-zinc-700' : 'bg-zinc-900 hover:bg-zinc-800'}`} onClick={() => { close(); p.onPick(o); }}>
          <text class={`truncate text-xs ${p.value() === o ? 'font-bold text-white' : 'text-zinc-200'}`} style={{ maxWidth: 166 }}>{p.label(o)}</text>
        </button>}</For>
      </scroll>
    </view>
  </view>;
  ui.openLayer(list.node, { priority: 100 });
  ui.anchor(list.node, field.node, 'bottom-start', 2);
  ui.onDismiss(list.node, close);
  ui.onOutsidePointer(list.node, (e: ui.PointerEvent) => close(), field.node);
  return node;
}
/** Yes or no. */
export function Switch(p: { value: () => boolean; yes: string; no: string; onPick: (v: boolean) => void }): i32 {
  return <button class="flex-row items-center justify-start gap-2 h-7 px-0 cursor-pointer bg-transparent" onClick={() => p.onPick(!p.value())}>
    <view class={`w-[30] h-[16] rounded-full flex-row items-center px-[2] ${p.value() ? 'bg-amber-400 justify-end' : 'bg-zinc-700 justify-start'}`}>
      <view class={`w-[12] h-[12] rounded-full ${p.value() ? 'bg-zinc-900' : 'bg-zinc-300'}`} />
    </view>
    <text class="text-xs text-zinc-300">{p.value() ? p.yes : p.no}</text>
  </button>;
}
