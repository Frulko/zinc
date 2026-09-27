// hero: animated title screen in the Solid model (inspired by PocketJS's Hero screen, original code).
// Arrows/Tab move the focus, Space/Enter activates, the mouse clicks. The animation runs on onTick.
import { createSignal, render, For } from 'zinc:ui/solid';
import { rect } from 'zinc:gfx';

const [t, setT] = createSignal<number>(0);
const [selected, setSelected] = createSignal<string>('nothing yet');
const [pulse, setPulse] = createSignal<number>(0);
const items: string[] = ['Play', 'Gallery', 'Settings', 'Credits'];

function ease(x: number): number { const c = Math.min(1, Math.max(0, x)); return 1 - (1 - c) * (1 - c) * (1 - c); }
function slide(delay: number): number { return Math.round((1 - ease((t() - delay) * 1.6)) * -340); }

function Stars(x: i32, y: i32, w: i32, h: i32): void {
  for (let i = 0; i < 40; i++) {
    const sx = (i * 73 + Math.floor(t() * (10 + (i % 5) * 8))) % w;
    const sy = (i * 37) % h;
    rect(x + sx, y + sy, 1, 1, i % 3 === 0 ? 0xfacc15 : 0x94a3b8);
  }
}

function App(): i32 {
  return <view class="flex-col h-full bg-slate-900">
    <canvas class="grow" onDraw={Stars}>
      <view class="flex-col p-4 gap-2 items-center">
        <text class="text-2xl text-amber-400" x={slide(0)}>ZINC</text>
        <text class="text-cyan-400" x={slide(0.15)}>JSX at 60 FPS, compiled to C++</text>
      </view>
    </canvas>
    <view class="flex-row p-2 gap-2 justify-center bg-slate-800">
      <For each={items}>{(label: string, i: i32) =>
        <button onClick={() => { setSelected(label); setPulse(1); }}>
          <text x={slide(0.3 + i * 0.08)}>{label}</text>
        </button>}
      </For>
    </view>
    <view class="flex-row p-2 justify-between bg-slate-900">
      <text class="text-slate-400">selected: {selected()}</text>
      <text class="text-pink-500" x={Math.round(pulse() * 6)}>{pulse() > 0.05 ? '*' : ' '}</text>
    </view>
  </view>;
}

render(App, 0x0f172a, (dt: number) => {
  setT(t() + dt);
  if (pulse() > 0) setPulse(Math.max(0, pulse() - dt * 2));
});
