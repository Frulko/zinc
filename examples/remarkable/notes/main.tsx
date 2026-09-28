// notes: a handwriting notebook for the reMarkable Paper Pro (zinc:ink + display-rmpp).
// Pen draws with pressure, the Marker's eraser end (or the Eraser tool) removes strokes; pages, colours, widths,
// undo/clear, save (JSON) and export (SVG). On the desktop the mouse is the pen (right button erases).
// NOTES_DEMO=1 replays a scripted pressure stroke (spiral + waves) through the live ink path.
import { createSignal, render, For } from 'zinc:ui/solid';
import { Ink, InkCanvas, Stroke, parseStrokes } from 'zinc:ink';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

const DIR = sys.platform() === 'rmpp' ? '/home/root/zinc-notes' : 'notes-data';
const COLORS: i32[] = [0x000000, 0x6b7280, 0x1d4ed8, 0xdc2626, 0x15803d, 0xca8a04];
const WIDTHS: number[] = [3, 6, 12];

const ink = new Ink();
const pages: Stroke[][] = [[]];
const [page, setPage] = createSignal<i32>(0);
const [count, setCount] = createSignal<i32>(1);
const [tool, setTool] = createSignal<string>('pen');
const [color, setColor] = createSignal<i32>(0x000000);
const [width, setWidth] = createSignal<number>(6);
const [status, setStatus] = createSignal<string>('');
ink.width = 6;

function file(i: i32, ext: string): string { return `${DIR}/page-${i + 1}.${ext}`; }
function load(): void {
  let i = 0;
  while (fs.exists(file(i, 'json'))) {
    try { pages[i] = parseStrokes(fs.readText(file(i, 'json'))); } catch (e) { pages[i] = []; }
    i++;
  }
  if (i > 0) { setCount(i); ink.setStrokes(pages[0]); }
}
function save(): void {
  pages[page()] = ink.strokes;
  fs.mkdir(DIR);
  try {
    fs.writeText(file(page(), 'json'), ink.toJSON());
    fs.writeText(file(page(), 'svg'), ink.toSVG());
    setStatus(`saved ${file(page(), 'svg')}`);
  } catch (e) { setStatus(`save failed: ${e.message}`); }
}
function go(i: i32): void {
  if (i < 0) return;
  pages[page()] = ink.strokes;
  if (i >= pages.length) { pages.push([]); setCount(pages.length); }
  ink.setStrokes(pages[i]);
  setPage(i);
  setStatus('');
}
function pickTool(t: string): void { setTool(t); ink.eraser = t === 'eraser'; }

// e-ink friendly: flat black/white/grey, big touch targets, no transitions or shadows
const BTN = 'px-6 py-4 rounded-lg border-2 border-black bg-white focus:bg-white';
function Tool(props: { label: string; on: () => boolean; press: () => void }): i32 {
  return <button class={props.on() ? 'px-6 py-4 rounded-lg bg-black focus:bg-black' : BTN} onClick={props.press}>
    <text class={props.on() ? 'text-[34px] text-white' : 'text-[34px] text-black'}>{props.label}</text>
  </button>;
}

function App(): i32 {
  return <view class="flex-col h-full bg-white">
    <view class="flex-row items-center gap-4 px-6 py-4">
      <Tool label="Pen" on={() => tool() === 'pen'} press={() => pickTool('pen')} />
      <Tool label="Eraser" on={() => tool() === 'eraser'} press={() => pickTool('eraser')} />
      <For each={COLORS}>{(c: i32, i: i32) =>
        <button class={color() === c ? 'w-[72px] h-[72px] rounded-full border-8 border-black' : 'w-[72px] h-[72px] rounded-full border-2 border-gray-300'}
          bg={c} onClick={() => { setColor(c); ink.color = c; pickTool('pen'); }}></button>}
      </For>
      <For each={WIDTHS}>{(w: number, i: i32) =>
        <Tool label={i === 0 ? 'Fine' : i === 1 ? 'Medium' : 'Bold'} on={() => width() === w} press={() => { setWidth(w); ink.width = w; }} />}
      </For>
    </view>
    <view class="h-[3px] bg-black"></view>
    <view class="flex-row items-center gap-4 px-6 py-3">
      <Tool label="Undo" on={() => false} press={() => ink.undo()} />
      <Tool label="Clear" on={() => false} press={() => ink.clear()} />
      <Tool label="<" on={() => false} press={() => go(page() - 1)} />
      <text class="text-[34px] text-black">page {page() + 1} / {count()}</text>
      <Tool label=">" on={() => false} press={() => go(page() + 1)} />
      <Tool label="Save" on={() => false} press={save} />
      <text class="text-[26px] text-gray-600">{status()}</text>
    </view>
    <view class="h-[3px] bg-black"></view>
    <InkCanvas ink={ink} class="grow" />
  </view>;
}

load();
// scripted replay: a pressure spiral and three waves, a few samples per frame like a real pen
let demo = sys.env('NOTES_DEMO') === '1' ? 0 : -1;
render(App, 0xffffff, (dt: number) => {
  if (demo < 0) return;
  for (let k = 0; k < 6 && demo < 900; k++, demo++) {
    const i = demo % 300, part = Math.floor(demo / 300);
    if (part === 0) {
      const a = i / 300 * Math.PI * 8, r = 20 + i * 1.3;
      ink.color = 0x000000; ink.width = 14;
      ink.feed(800 + Math.cos(a) * r, 700 + Math.sin(a) * r, 0.5 + 0.5 * Math.sin(i / 20), i === 299 ? 0 : 1);
    } else {
      ink.color = part === 1 ? 0x1d4ed8 : 0xdc2626; ink.width = 10;
      ink.feed(150 + i * 4.4, 1300 + part * 180 + Math.sin(i / 18) * 60, i / 300, i === 299 ? 0 : 1);
    }
  }
});
