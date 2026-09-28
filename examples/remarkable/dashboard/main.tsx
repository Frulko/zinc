// dashboard: an e-ink friendly JSX app for the reMarkable Paper Pro. High contrast, big targets, no animation:
// only what changes is redrawn (the clock once a minute, the timer once a second, a tapped task), so display-rmpp
// refreshes small rectangles with its fast waveform and upgrades them once the screen is idle.
import { createSignal, render, For } from 'zinc:ui/solid';
import { InkCanvas, Ink } from 'zinc:ink';

const [now, setNow] = createSignal<number>(Date.now());
const [left, setLeft] = createSignal<i32>(25 * 60);
const [running, setRunning] = createSignal<boolean>(false);
const tasks: string[] = ['Review the Q3 plan', 'Call the plumber', 'Sketch the new logo', 'Read chapter 4', 'Water the plants'];
const [done, setDone] = createSignal<boolean[]>([false, true, false, false, false]);
const habits: string[] = ['Run', 'Read', 'Write'];
const [grid, setGrid] = createSignal<boolean[]>([true, false, true, true, false, false, false, true, true, true, false, true, false, false, false, true, false, false, true, false, false]);
const scratch = new Ink();
scratch.width = 5;

function two(n: number): string { return `${Math.floor(n)}`.padStart(2, '0'); }
function clock(): string { const m = Math.floor(now() / 60000); return `${two((m / 60) % 24)}:${two(m % 60)}`; }
function toggle(list: boolean[], i: i32): boolean[] { const c = list.slice(); c[i] = !c[i]; return c; }

const CARD = 'flex-col gap-4 p-8 rounded-xl border-2 border-black bg-white';
function App(): i32 {
  return <view class="flex-col h-full gap-8 p-10 bg-white">
    <view class="flex-row justify-between items-center">
      <view class="flex-col">
        <text class="text-[120px] font-bold text-black">{clock()}</text>
        <text class="text-[36px] text-gray-600">UTC - Zinc on e-ink</text>
      </view>
      <view class={CARD}>
        <text class="text-[36px] text-gray-600">Focus timer</text>
        <text class="text-[96px] font-bold text-black">{two(left() / 60)}:{two(left() % 60)}</text>
        <button class="px-8 py-4 rounded-lg bg-black focus:bg-black" onClick={() => setRunning(!running())}>
          <text class="text-[36px] text-white">{running() ? 'Pause' : 'Start'}</text>
        </button>
      </view>
    </view>
    <view class={CARD}>
      <text class="text-[44px] font-bold text-black">Today</text>
      <For each={tasks}>{(t: string, i: i32) =>
        <button class="flex-row items-center justify-start gap-6 py-3 bg-white focus:bg-white" onClick={() => setDone(toggle(done(), i))}>
          <view class={done()[i] ? 'w-[56px] h-[56px] rounded-md bg-black' : 'w-[56px] h-[56px] rounded-md border-4 border-black'}></view>
          <text class={done()[i] ? 'text-[40px] text-gray-400' : 'text-[40px] text-black'}>{t}</text>
        </button>}
      </For>
    </view>
    <view class={CARD}>
      <text class="text-[44px] font-bold text-black">Habits this week</text>
      <For each={habits}>{(h: string, r: i32) =>
        <view class="flex-row items-center gap-4">
          <text class="w-[160px] text-[36px] text-black">{h}</text>
          <For each={[0, 1, 2, 3, 4, 5, 6]}>{(d: i32, k: i32) =>
            <button class={grid()[r * 7 + d] ? 'w-[80px] h-[80px] rounded-lg bg-blue-700 focus:bg-blue-700' : 'w-[80px] h-[80px] rounded-lg border-2 border-gray-400 bg-white focus:bg-white'}
              onClick={() => setGrid(toggle(grid(), r * 7 + d))}></button>}
          </For>
        </view>}
      </For>
    </view>
    <view class="flex-col grow gap-2">
      <text class="text-[36px] text-gray-600">Scratchpad (pen)</text>
      <view class="grow p-[3px] rounded-lg bg-black">
        <InkCanvas ink={scratch} class="grow" />
      </view>
    </view>
  </view>;
}

setInterval(() => setNow(Date.now()), 1000);
setInterval(() => { if (running() && left() > 0) setLeft(left() - 1); }, 1000);
render(App, 0xffffff, null);
