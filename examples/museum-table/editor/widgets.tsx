// The small parts the panels of the editor share: icons, buttons, a segmented choice, a text field per language.
import { NodeRef } from 'zinc:ui/solid';
import { icon } from 'zinc:icons';
import { Svg } from 'zinc:svg';

/** The colours of the editor's chrome (Tailwind's zinc greys, amber for what is selected or primary). */
export const ACCENT: i32 = 0xfbbf24, INK: i32 = 0xf4f4f5, MUTED: i32 = 0xa1a1aa, DANGER: i32 = 0xf87171, WARN: i32 = 0xfb923c, DARK: i32 = 0x18181b;

// ponytail: a program draws the characters of its own sources and of its assets' text files, and an editor shows texts that are in neither
// (a title typed in a field, a project opened from a folder). Until fonts can be asked at run time (ZN-669) this constant puts Latin-1,
// Latin Extended-A and typographic punctuation into the font; a character outside them draws as a missing glyph.
export const DRAWN = '¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ‘’‚“”„†‡•…‰′″‹›€™–—−×÷≠≤≥°';

/** A Lucide icon that is drawn only when the window repaints (zinc:icons' own Icon keeps the window repainting every frame). */
export function Ico(p: { name: string; size: number; color: i32 }): i32 {
  return <canvas class="shrink-0" style={{ width: p.size, height: p.size, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const s = icon(p.name, p.color, 2);
    if (s !== null) (s as Svg).draw(x, y, w, h, 255);
  }} />;
}
/** The same at a size that follows a signal (the storyboard's zoom). */
export function IcoAt(p: { name: string; size: () => number; color: i32 }): i32 {
  return <canvas class="shrink-0" style={{ width: p.size(), height: p.size(), lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const s = icon(p.name, p.color, 2);
    if (s !== null) (s as Svg).draw(x, y, w, h, 255);
  }} />;
}

/** A button of the top bar: an icon and a word ('' for the icon alone). `off`: shown dimmed (nothing to undo); `look`: 'plain', 'primary' or 'quiet'. */
export function Tool(p: { icon: string; label: string; look: string; off: () => boolean; onClick: () => void }): i32 {
  const fill = p.look === 'primary' ? 'bg-amber-400 hover:bg-amber-300 active:bg-amber-500' : p.look === 'quiet' ? 'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600';
  return <button class={`flex-row items-center gap-[6] h-8 px-[10] rounded-md cursor-pointer ${fill} ${p.off() ? 'opacity-40' : ''}`} onClick={p.onClick}>
    <Ico name={p.icon} size={15} color={p.look === 'primary' ? DARK : INK} />
    {p.label.length > 0 ? <text class={`text-xs font-bold ${p.look === 'primary' ? 'text-zinc-900' : 'text-zinc-100'}`}>{p.label}</text> : <view />}
  </button>;
}
/** A button of a panel, as wide as its row. `look`: 'plain' or 'danger'. */
export function Action(p: { icon: string; label: string; look: string; onClick: () => void }): i32 {
  return <button class={`grow flex-row items-center justify-center gap-[6] h-8 px-3 rounded-md cursor-pointer border bg-zinc-900 ${p.look === 'danger' ? 'border-red-900 hover:bg-red-950' : 'border-zinc-700 hover:bg-zinc-800'}`} onClick={p.onClick}>
    <Ico name={p.icon} size={14} color={p.look === 'danger' ? DANGER : INK} />
    <text class={`text-xs font-bold ${p.look === 'danger' ? 'text-red-400' : 'text-zinc-100'}`}>{p.label}</text>
  </button>;
}
/** One of a few choices, all visible. */
export function Segmented(p: { options: string[]; labels: string[]; value: () => string; onPick: (v: string) => void }): i32 {
  return <view class="flex-row gap-[2] p-[2] rounded-md bg-zinc-950 border border-zinc-800">
    {p.options.map((o: string, i: i32) => <button class={`grow flex-row items-center justify-center h-7 px-2 rounded cursor-pointer ${p.value() === o ? 'bg-zinc-700' : 'bg-zinc-950 hover:bg-zinc-800'}`} onClick={() => p.onPick(o)}>
      <text class={`text-xs ${p.value() === o ? 'font-bold text-white' : 'text-zinc-400'}`}>{p.labels[i]}</text>
    </button>)}
  </view>;
}
/** A text in one language: the language code, then the field. `onDone` runs when the field is left. */
export function LangField(p: { language: string; value: () => string; placeholder: string; field: NodeRef; onInput: (v: string) => void; onDone: () => void }): i32 {
  return <view class="flex-row items-center gap-2">
    <view class="w-[30] h-8 items-center justify-center rounded-md bg-zinc-800"><text class="text-[11px] font-bold text-zinc-300">{p.language.toUpperCase()}</text></view>
    <input ref={p.field} class="grow h-8 px-2 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 focus:border-amber-400" placeholder={p.placeholder}
      value={p.value()} onInput={p.onInput} onChange={(v: string) => p.onDone()} />
  </view>;
}
/** An exact number (the advanced mode): taken when the field is left or Enter is pressed; what is not a number is put back. */
export function NumberField(p: { label: string; value: () => number; onCommit: (v: number) => void; onDone: () => void }): i32 {
  return <view class="grow flex-row items-center gap-2">
    <text class="text-[11px] font-bold text-zinc-400">{p.label}</text>
    <input class="grow h-8 px-2 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 focus:border-amber-400" style={{ width: 60 }} value={`${p.value()}`}
      onChange={(v: string) => { const n = parseFloat(v); if (n - n === 0) p.onCommit(n); p.onDone(); }} />
  </view>;
}
/** The small capital heading of a group of a panel. */
export function Heading(p: { label: string }): i32 {
  return <text class="text-[11px] font-bold text-zinc-500" style={{ letterSpacing: 0.6 }}>{p.label.toUpperCase()}</text>;
}
