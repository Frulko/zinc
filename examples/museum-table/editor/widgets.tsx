// The small parts the panels of the editor share: icons, buttons, a segmented choice, text fields per language, and how a medium is drawn.
import { NodeRef, For, createSignal, createNodeRef } from 'zinc:ui/solid';
import { rrect, imageFromBytes, destroyImage, createImage, beginImage, endImage, drawImage, drawImageRect, imageWidth, imageHeight } from 'zinc:gfx';
import { readBytes } from 'zinc:fs';
import { icon } from 'zinc:icons';
import { Svg } from 'zinc:svg';
import { Media, KINDS, copyProject } from '../src/project';
import { ObjectView } from '../src/viewer';
import { Frame } from '../src/frame';
import { project, folder } from './state';

/** The colours of the editor's chrome (Tailwind's zinc greys, amber for what is selected or primary). */
export const ACCENT: i32 = 0xfbbf24, INK: i32 = 0xf4f4f5, MUTED: i32 = 0xa1a1aa, DANGER: i32 = 0xf87171, WARN: i32 = 0xfb923c, DARK: i32 = 0x18181b;

// ponytail: a program draws the characters of its own sources and of its assets' text files, and an editor shows texts that are in neither
// (a title typed in a field, a project opened from a folder). Until fonts can be asked at run time (ZN-669) this constant puts Latin-1,
// Latin Extended-A and typographic punctuation into the font; a character outside them draws as a missing glyph.
export const DRAWN = '¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ‘’‚“”„†‡•…‰′″‹›€™–—−×÷≠≤≥°';

// ---------------------------------------------------------------- media

/** The icon and the colour of each kind of medium (in the order of KINDS). */
export const KIND_ICON: string[] = ['image', 'box', 'globe', 'type', 'volume-2', 'film'];
export const KIND_COLOUR: i32[] = [0x38bdf8, 0xf59e0b, 0x2dd4bf, 0xd4d4d8, 0xa78bfa, 0xfb7185];
/** Height over width of a medium whose item does not say its height. */
export const KIND_SHAPE: number[] = [0.75, 1, 0.5, 0.6, 0.25, 0.5625];
export function kindIndex(m: Media | null): i32 { return m === null ? -1 : KINDS.indexOf(m.kind); }
// The photographs of the project folder, as thumbnails. A picture is decoded the first time it is to be drawn, one per frame so that a
// folder of photographs never stalls the window, reduced to THUMB pixels wide and kept; the engine holds 64 runtime images at once
// (ZN-670), so at most KEPT thumbnails live, and the one drawn longest ago makes room.
// ponytail: more than KEPT pictures visible at the same time (a very large storyboard) decode in turns; a bigger limit ends that.
const THUMB = 320, KEPT = 40;
class Picture { file = ''; image: i32 = -1; w: i32 = 1; h: i32 = 1; seen: i32 = 0; }
const pictures: Picture[] = [], wanted: string[] = [];
let frame: i32 = 0;
const [arrived, setArrived] = createSignal<i32>(0);
/** What a thumbnail of a 3D model is kept under: the model as the table first shows it (its file, its texture, its opening view, its light). */
const MODEL = 'model ';
/** The file of the project folder that shows a medium: a photograph, a panorama, the poster of a film ('' when it has none); for a 3D
 *  model the name of its rendered thumbnail. */
function pictureFile(m: Media | null): string {
  if (m === null || folder().length === 0) return '';
  if (m.kind === 'model') return `${MODEL}${m.id} ${m.file} ${m.texture} ${m.view.yaw} ${m.view.pitch} ${m.view.distance} ${m.light}`;
  const file = m.kind === 'photo' || m.kind === 'panorama' ? m.file : m.kind === 'video' ? m.poster : '';
  return file.length > 0 ? `${folder()}/${file}` : '';
}
/** The thumbnail of a file, null while it is not decoded yet or when the file is not a picture. */
function pictureOf(file: string): Picture | null {
  if (file.length === 0) return null;
  for (const p of pictures) if (p.file === file) { p.seen = frame; return p.image >= 0 ? p : null; }
  if (wanted.indexOf(file) < 0) wanted.push(file);
  return null;
}
/** Once per frame (main.tsx): decodes one of the pictures the last frame wanted. */
export function decodePictures(): void {
  frame++;
  if (wanted.length === 0) return;
  const p = new Picture();
  p.file = wanted[0]; p.seen = frame;
  wanted.splice(0, 1);
  try {
    if (p.file.startsWith(MODEL)) {   // the object as the table's own viewer first shows it, drawn once
      const snap = copyProject(project()), own = snap.medium(p.file.split(' ')[1]);
      if (own !== null) {
        const view = new ObjectView(snap, own, snap.theme, snap.languages[0], new Frame(THUMB, THUMB), false);
        view.x = THUMB / 2; view.y = THUMB / 2; view.w = THUMB; view.h = THUMB;
        p.w = THUMB; p.h = THUMB;
        p.image = createImage(THUMB, THUMB);
        beginImage(p.image); view.render(0, 0, 1); endImage();
        view.dispose();
      }
    }
    const full: i32 = p.file.startsWith(MODEL) ? -1 : imageFromBytes(readBytes(p.file));
    if (full >= 0) {
      const w = imageWidth(full), h = imageHeight(full);
      p.w = Math.min(w, THUMB); p.h = Math.max(1, Math.round(h * p.w / w));
      p.image = createImage(p.w, p.h);
      beginImage(p.image); drawImage(full, 0, 0, p.w, p.h, 255, 0); endImage();
      destroyImage(full);
    }
  } catch (e) { p.image = -1; }   // a file that is gone or cannot be read is drawn as its kind, like a file that is not a picture
  pictures.push(p);
  const held = pictures.filter((x: Picture) => x.image >= 0);
  if (held.length > KEPT) {
    let oldest = held[0];
    for (const x of held) if (x.seen < oldest.seen) oldest = x;
    destroyImage(oldest.image);
    pictures.splice(pictures.indexOf(oldest), 1);
  }
  setArrived(arrived() + 1);
}
/** Height over width of a medium on the table when its item does not say its height: the picture's own once it is known. */
export function shapeOf(m: Media | null): number {
  arrived();
  const p = pictureOf(pictureFile(m)), k = kindIndex(m);
  return p !== null ? p.h / p.w : k >= 0 ? KIND_SHAPE[k] : 0.75;
}
/** Draws a medium in a box of the window: the one place that decides what a medium looks like in the editor. A picture of the project
 *  folder fills the box (cut to its shape); anything else, and a picture not decoded yet, is a tinted box with the icon of its kind. */
export function drawMedia(m: Media | null, x: number, y: number, w: number, h: number): void {
  const p = pictureOf(pictureFile(m));
  if (p !== null) {
    let sw: number = p.w, sh: number = p.h;
    if (p.w * h > w * p.h) sw = p.h * w / h; else sh = p.w * h / w;
    drawImageRect(p.image, (p.w - sw) / 2, (p.h - sh) / 2, sw, sh, x, y, w, h, 255, 0);
    return;
  }
  const k = kindIndex(m), colour = k >= 0 ? KIND_COLOUR[k] : 0x71717a;
  if (Math.min(w, h) < 24) { rrect(x, y, w, h, 2, colour, 215); return; }   // too small for an icon: the colour of its kind
  rrect(x, y, w, h, 4, colour, 46);
  const size = Math.max(10, Math.min(40, Math.min(w, h) * 0.4)), s = icon(k >= 0 ? KIND_ICON[k] : 'image', colour, 2);
  if (s !== null) (s as Svg).draw(Math.round(x + (w - size) / 2), Math.round(y + (h - size) / 2), Math.round(size), Math.round(size), 255);
}

// ---------------------------------------------------------------- controls

/** A Lucide icon that is drawn only when the window repaints (zinc:icons' own Icon keeps the window repainting every frame). */
export function Ico(p: { name: string; size: number; color: i32 }): i32 {
  return <Canvas className="shrink-0" style={{ width: p.size, height: p.size, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const s = icon(p.name, p.color, 2);
    if (s !== null) (s as Svg).draw(x, y, w, h, 255);
  }} />;
}
/** The same at a size that follows a signal (the storyboard's zoom). */
export function IcoAt(p: { name: string; size: () => number; color: i32 }): i32 {
  return <Canvas className="shrink-0" style={{ width: p.size(), height: p.size(), lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const s = icon(p.name, p.color, 2);
    if (s !== null) (s as Svg).draw(x, y, w, h, 255);
  }} />;
}
/** A button of the top bar: an icon and a word ('' for the icon alone). `off`: shown dimmed (nothing to undo); `look`: 'plain', 'primary',
 *  'quiet', or 'on' (what it switches is on). */
export function Tool(p: { icon: string; label: string; look: string; off: () => boolean; onClick: () => void }): i32 {
  const fill = p.look === 'primary' ? 'bg-amber-400 hover:bg-amber-300 active:bg-amber-500' : p.look === 'quiet' ? 'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700'
    : p.look === 'on' ? 'bg-zinc-700 border border-amber-400 hover:bg-zinc-600' : 'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600';
  return <Button className={`bg-slate-700 py-1 flex-row items-center gap-[6] h-8 px-[10] rounded-md cursor-pointer ${fill} ${p.off() ? 'opacity-40' : ''}`} onClick={p.onClick}>
    <Ico name={p.icon} size={15} color={p.look === 'primary' ? DARK : INK} />
    {p.label.length > 0 ? <Text className={`text-xs font-bold ${p.look === 'primary' ? 'text-zinc-900' : 'text-zinc-100'}`}>{p.label}</Text> : <View />}
  </Button>;
}
/** A button of a panel, as wide as its row. `look`: 'plain', 'primary' or 'danger'. */
export function Action(p: { icon: string; label: string; look: string; onClick: () => void }): i32 {
  const fill = p.look === 'danger' ? 'bg-zinc-900 border-red-900 hover:bg-red-950' : p.look === 'primary' ? 'bg-amber-400 border-amber-400 hover:bg-amber-300' : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800';
  return <Button className={`bg-slate-700 py-1 grow flex-row items-center justify-center gap-[6] h-8 px-3 rounded-md cursor-pointer border ${fill}`} onClick={p.onClick}>
    <Ico name={p.icon} size={14} color={p.look === 'danger' ? DANGER : p.look === 'primary' ? DARK : INK} />
    <Text className={`text-xs font-bold ${p.look === 'danger' ? 'text-red-400' : p.look === 'primary' ? 'text-zinc-900' : 'text-zinc-100'}`}>{p.label}</Text>
  </Button>;
}
/** One of a few choices, all visible. */
export function Segmented(p: { options: string[]; labels: string[]; value: () => string; onPick: (v: string) => void }): i32 {
  return <View className="flex-row gap-[2] p-[2] rounded-md bg-zinc-950 border border-zinc-800">
    {p.options.map((o: string, i: i32) => <Button className={`py-1 grow flex-row items-center justify-center h-7 px-2 rounded cursor-pointer ${p.value() === o ? 'bg-zinc-700' : 'bg-zinc-950 hover:bg-zinc-800'}`} onClick={() => p.onPick(o)}>
      <Text className={`text-xs ${p.value() === o ? 'font-bold text-white' : 'text-zinc-400'}`}>{p.labels[i]}</Text>
    </Button>)}
  </View>;
}
const FIELD = 'rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 focus:border-amber-400';
/** A text in one language: the language code, then the field. `onDone` runs when the field is left. */
export function LangField(p: { language: string; value: () => string; placeholder: string; field: NodeRef; onInput: (v: string) => void; onDone: () => void }): i32 {
  return <View className="flex-row items-center gap-2">
    <View className="w-[30] h-8 items-center justify-center rounded-md bg-zinc-800"><Text className="text-[11px] font-bold text-zinc-300">{p.language.toUpperCase()}</Text></View>
    <Input ref={p.field} className={`py-1.5 grow h-8 px-2 ${FIELD}`} placeholder={p.placeholder} value={p.value()} onInput={p.onInput} onChange={(v: string) => p.onDone()} />
  </View>;
}
/** A text in every language of the project, side by side: one column per language, so that a translation is written next to its original.
 *  `rows` 1: a line; more: a paragraph of that height. `width`: the width of one column, which follows the number of languages. `first`: a reference to the field of the first
 *  language, for a panel that puts the caret there (null when it does not). */
export function LangColumns(p: { rows: i32; width: () => number; first: NodeRef | null; value: (language: string) => string; placeholder: (first: boolean) => string; onInput: (language: string, v: string) => void; onDone: () => void }): i32 {
  return <View className="flex-row gap-2">
    <For each={project().languages}>{(language: string, i: i32) => {
      const given = p.first, field: NodeRef = i === 0 && given !== null ? given : createNodeRef();
      return <View className="flex-col gap-1" style={{ width: p.width() }}>
        <Text className="text-[10px] font-bold text-zinc-500">{language.toUpperCase()}</Text>
        {p.rows === 1
          ? <Input ref={field} className={`py-1.5 w-full h-8 px-2 ${FIELD}`} placeholder={p.placeholder(i === 0)} value={p.value(language)} onInput={(v: string) => p.onInput(language, v)} onChange={(v: string) => p.onDone()} />
          : <TextArea ref={field} className={`w-full p-2 ${FIELD}`} rows={p.rows} placeholder={p.placeholder(i === 0)} value={p.value(language)} onInput={(v: string) => p.onInput(language, v)} onChange={(v: string) => p.onDone()} />}
      </View>;
    }}</For>
  </View>;
}
/** One line of text that is not per language (an author, a licence). */
export function PlainField(p: { label: string; value: () => string; placeholder: string; onInput: (v: string) => void; onDone: () => void }): i32 {
  return <View className="flex-col gap-1">
    <Text className="text-[11px] text-zinc-400">{p.label}</Text>
    <Input className={`py-1.5 w-full h-8 px-2 ${FIELD}`} placeholder={p.placeholder} value={p.value()} onInput={p.onInput} onChange={(v: string) => p.onDone()} />
  </View>;
}
/** An exact number: taken when the field is left or Enter is pressed; what is not a number is put back. */
export function NumberField(p: { label: string; value: () => number; onCommit: (v: number) => void; onDone: () => void }): i32 {
  return <View className="flex-row items-center gap-2">
    <Text className="text-[11px] font-bold text-zinc-400">{p.label}</Text>
    <Input className={`py-1.5 h-8 px-2 ${FIELD}`} style={{ width: 76 }} value={`${p.value()}`}
      onChange={(v: string) => { const n = parseFloat(v.replaceAll(',', '.')); if (n - n === 0) p.onCommit(n); p.onDone(); }} />
  </View>;
}
/** "#rrggbb" for a colour, and the colour a text names (-1 when it names none): "#2f6fd0", "2F6FD0" or the short "#26d". */
export function hexOf(c: i32): string {
  let s = '#';
  for (let shift = 20; shift >= 0; shift -= 4) s += '0123456789abcdef'.charAt((c >> shift) & 15);
  return s;
}
export function colourOf(text: string): i32 {
  let h = text.trim().toLowerCase();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  if (h.length !== 6) return -1;
  for (let i = 0; i < 6; i++) if ('0123456789abcdef'.indexOf(h.charAt(i)) < 0) return -1;
  return parseInt(h, 16);
}
/** A colour: its swatch, what it is for, and its #rrggbb text, taken when the field is left or Enter is pressed; what is not a colour is
 *  put back. */
export function ColourField(p: { label: string; hint: string; value: () => i32; onCommit: (c: i32) => void; onDone: () => void }): i32 {
  return <View className="flex-row items-center gap-3 h-10">
    <View className="w-[28] h-[28] shrink-0 rounded-md border border-zinc-600" style={{ bg: p.value() }} />
    <View className="grow basis-0 min-w-0 flex-col">
      <Text className="truncate text-xs font-bold text-zinc-100">{p.label}</Text>
      <Text className="truncate text-[11px] text-zinc-500">{p.hint}</Text>
    </View>
    <Input className={`py-1.5 h-8 px-2 font-mono ${FIELD}`} style={{ width: 96 }} value={hexOf(p.value())}
      onChange={(v: string) => { const c = colourOf(v); if (c >= 0) p.onCommit(c); p.onDone(); }} />
  </View>;
}
/** The small capital heading of a group of a panel. */
export function Heading(p: { label: string }): i32 {
  return <Text className="text-[11px] font-bold text-zinc-500" style={{ letterSpacing: 0.6 }}>{p.label.toUpperCase()}</Text>;
}
