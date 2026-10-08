// Two pages for e-paper: Today (a list ticked with the pen) and Sketch (ink). Black on white, large targets, nothing moves unless touched.
import { createSignal, render, Show } from 'zinc:ui/solid';
import { Ink, InkCanvas, parseStrokes } from 'zinc:ink';
import { TodoList } from './todo';
import { loadTodo, saveTodo, loadSketch, saveSketch } from './store';

const todo = loadTodo();
const [version, setVersion] = createSignal<i32>(0);   // bumped when the list changes: the list re-renders
const [page, setPage] = createSignal<string>('Today');
const ink = new Ink();
ink.width = 3;
const saved = loadSketch();
if (saved !== '') { ink.strokes = parseStrokes(saved); ink.stale = true; }
let savedVersion = ink.version;

function changed(): void { saveTodo(todo); setVersion(version() + 1); }

function renderTab(name: string): i32 {
  return <button class={`grow h-[88px] items-center justify-center ${page() === name ? 'bg-black' : 'bg-white'} focus:outline-none`} onClick={() => setPage(name)}>
    <text class={`text-[34px] font-bold ${page() === name ? 'text-white' : 'text-black'}`}>{name}</text>
  </button>;
}

function renderItem(i: i32): i32 {
  const t = todo.items[i];
  return <button class="flex-row items-center gap-6 px-8 h-[96px] border-b-2 border-black bg-white focus:bg-white" onClick={() => { todo.toggle(i); changed(); }}>
    <view class={`w-[44px] h-[44px] border-[4px] border-black rounded-[6px] items-center justify-center ${t.done ? 'bg-black' : 'bg-white'}`}>
      <text class="text-[30px] font-bold text-white">{t.done ? '✓' : ''}</text>
    </view>
    <text class={`grow text-[32px] text-black ${t.done ? 'line-through' : ''}`}>{t.text}</text>
  </button>;
}

function Today(): i32 {
  return <view class="flex-col grow">
    <view class="flex-row items-center justify-between px-8 py-6">
      <text class="text-[40px] font-bold text-black">{version() >= 0 ? `${todo.left()} left` : ''}</text>
      <button class="px-6 py-3 border-[3px] border-black rounded-[8px] bg-white focus:bg-white" onClick={() => { if (todo.clearDone() > 0) changed(); }}>
        <text class="text-[28px] text-black">Clear ticked</text>
      </button>
    </view>
    <view class="h-[3px] bg-black" />
    <For each={version() >= 0 ? todo.items.map((t, i: i32): i32 => i) : []}>{(i: i32) => renderItem(i)}</For>
  </view>;
}

function Sketch(): i32 {
  return <view class="flex-col grow">
    <view class="flex-row items-center gap-4 px-8 py-4">
      <button class="px-6 py-3 border-[3px] border-black rounded-[8px] bg-white focus:bg-white" onClick={() => { ink.eraser = !ink.eraser; setVersion(version() + 1); }}>
        <text class="text-[28px] text-black">{version() >= 0 && ink.eraser ? 'Eraser' : 'Pen'}</text>
      </button>
      <button class="px-6 py-3 border-[3px] border-black rounded-[8px] bg-white focus:bg-white" onClick={() => ink.undo()}><text class="text-[28px] text-black">Undo</text></button>
      <button class="px-6 py-3 border-[3px] border-black rounded-[8px] bg-white focus:bg-white" onClick={() => ink.clear()}><text class="text-[28px] text-black">Clear</text></button>
    </view>
    <view class="h-[3px] bg-black" />
    <InkCanvas ink={ink} class="grow" />
  </view>;
}

function App(): i32 {
  return <view class="flex-col w-full h-full bg-white">
    <view class="flex-row items-center px-8 h-[96px]"><text class="text-[44px] font-bold text-black">{'{{name}}'}</text></view>
    <view class="flex-row border-y-[3px] border-black">{renderTab('Today')}{renderTab('Sketch')}</view>
    <Show when={page() === 'Today'}><Today /></Show>
    <Show when={page() === 'Sketch'}><Sketch /></Show>
  </view>;
}

render(App, 0xffffff, (dt: number) => { if (ink.version !== savedVersion) { savedVersion = ink.version; saveSketch(ink.toJSON()); } });
