import { createSignal, render } from 'zinc:ui/solid';
import { Ink, InkCanvas } from 'zinc:ink';

const ink = new Ink();
const [strokes, setStrokes] = createSignal<i32>(0);

function App(): i32 {
  return <view class="flex-col h-full bg-white">
    <view class="flex-row items-center gap-6 p-6">
      <text class="text-[48px] font-bold text-black">My app</text>
      <button class="px-6 py-4 rounded-lg border-2 border-black bg-white focus:bg-white" onClick={() => { ink.undo(); setStrokes(ink.strokes.length); }}>
        <text class="text-[34px] text-black">Undo</text>
      </button>
      <text class="text-[34px] text-gray-600">{strokes()} stroke(s)</text>
    </view>
    <view class="h-[3px] bg-black"></view>
    <InkCanvas ink={ink} class="grow" />
  </view>;
}

render(App, 0xffffff, (dt: number) => { if (ink.strokes.length !== strokes()) setStrokes(ink.strokes.length); });
