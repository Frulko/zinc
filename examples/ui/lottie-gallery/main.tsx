// Lottie gallery: animations from assets/ in a grid (zinc:ui + zinc:lottie), with a fps readout.
// Click a card to pause/resume it: a paused animation redraws the same commands, the frame diff rasterizes nothing.
import { createSignal, render, For } from 'zinc:ui/solid';
import { Lottie, Player, drawMs } from 'zinc:lottie';

const files: string[] = ['spinner.json', 'shapes.json', 'orbit.json', 'TwitterHeart.json', 'Watermelon.json', 'PinJump.json',
  'LottieLogo1.json', 'IconTransitions.json', '9squares_AlBoardman.json', 'HamburgerArrow.json', 'Switch.json', 'skottie-trimpath-modes.json'];
const [stats, setStats] = createSignal<string>('');

function Card(props: { file: string }): i32 {
  let player: Player | null = null;
  return <button class="flex-col items-center gap-1 p-2 w-[128px] bg-slate-800 rounded-lg" onClick={() => {
    const p = player;
    if (p !== null) { if (p.playing) p.pause(); else p.play(); }
  }}>
    <Lottie src={props.file} loop autoplay class="w-[112px] h-[112px]" player={(p: Player) => { player = p; }} />
    <text class="text-xs text-slate-400">{props.file.replace('.json', '').replace('_AlBoardman', '').replace('skottie-', '')}</text>
  </button>;
}

function App(): i32 {
  return <view class="flex-col h-full p-3 gap-2 bg-slate-900">
    <view class="flex-row justify-between">
      <text class="text-lg text-white font-bold">zinc:lottie</text>
      <text class="text-sm text-emerald-400">{stats()}</text>
    </view>
    <view class="flex-row flex-wrap gap-2 justify-center">
      <For each={files}>{(f: string) => <Card file={f} />}</For>
    </view>
  </view>;
}

let acc = 0, frames = 0, vec = 0;
render(App, 0x0f172a, (dt: number) => {
  acc += dt; frames++; vec += drawMs();
  if (acc >= 0.5) {
    setStats(`${Math.round(frames / acc)} fps · lottie ${(vec / frames).toFixed(2)} ms/frame`);
    acc = 0; frames = 0; vec = 0;
  }
});
