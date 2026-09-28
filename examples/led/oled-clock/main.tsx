// oled-clock: a JSX (React model) screen on a 128x64 SSD1306 OLED, react-ssd1306 style. The UI renders in colour
// like anywhere else; the display driver turns it into 1-bit pixels (dither option in zinc.json).
// Without a network clock (ESP32 has no SNTP here) the time is the uptime; on hosts it is UTC.
import { render, useState, useEffect } from 'zinc:ui/react';

let setNowRef: ((v: i32) => void) | null = null;
function two(n: i32): string { return n < 10 ? `0${n}` : `${n}`; }

function Clock(): i32 {
  const [secs, setSecs] = useState<i32>(0);
  useEffect(() => { setNowRef = setSecs; }, []);
  const h: i32 = Math.floor(secs / 3600) % 24, m: i32 = Math.floor(secs / 60) % 60, s: i32 = secs % 60;
  return <view class="flex-col h-full p-1 gap-1 bg-black">
    <view class="flex-row justify-between">
      <text class="text-xs text-white">ZINC</text>
      <text class="text-xs text-white">{two(s)} s</text>
    </view>
    <text class="text-2xl text-white text-center">{two(h)}:{two(m)}</text>
    <view class="h-1 bg-white" width={Math.floor(s * 126 / 59)}></view>
  </view>;
}

render(Clock, 0x000000, (dt: number) => {
  const set = setNowRef;
  if (set !== null) set(Math.floor(Date.now() / 1000) % 86400);
});
