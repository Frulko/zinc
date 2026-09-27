// text demo, Solid model: fine-grained updates (only the frame counter text changes each frame).
import { createSignal } from 'zinc:ui/solid';
import { TITLE, SUBTITLE, BODY } from './screen';

const [frames, setFrames] = createSignal<i32>(0);
export function Screen(): i32 {
  return <view class="flex-col p-2 gap-2 bg-slate-900 h-full">
    <text class="text-2xl text-amber-400 text-center">{TITLE}</text>
    <text class="text-cyan-400">{SUBTITLE}</text>
    <text class="text-slate-200">{BODY}</text>
    <text class="text-right text-pink-500">right aligned</text>
    <text class="text-center text-green-500">frame {frames()}</text>
  </view>;
}
export function tickFrames(): void { setFrames(frames() + 1); }
