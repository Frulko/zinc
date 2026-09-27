// text demo, React model: the component re-renders when its state changes.
import { useState, useEffect } from 'zinc:ui/react';
import { TITLE, SUBTITLE, BODY } from './screen';

let tick: i32 = 0;
let setFramesRef: ((v: i32) => void) | null = null;
export function Screen(): i32 {
  const [frames, setFrames] = useState<i32>(0);
  useEffect(() => { setFramesRef = setFrames; }, []);
  return <view class="flex-col p-2 gap-2 bg-slate-900 h-full">
    <text class="text-2xl text-amber-400 text-center">{TITLE}</text>
    <text class="text-cyan-400">{SUBTITLE}</text>
    <text class="text-slate-200">{BODY}</text>
    <text class="text-right text-pink-500">right aligned</text>
    <text class="text-center text-green-500">frame {frames}</text>
  </view>;
}
export function tickFrames(): void {
  tick++;
  const set = setFramesRef;
  if (set !== null) set(tick);
}
