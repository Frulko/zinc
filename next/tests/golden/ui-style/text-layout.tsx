// Text layout (ZN-269): line-clamp, truncate, justify, balance, break-words.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="flex-col gap-2 p-2 bg-white w-full">
    <Text class="text-sm text-slate-900 line-clamp-2 w-40">The quick brown fox jumps over the lazy dog and keeps running far away from here</Text>
    <Text class="text-sm text-slate-900 truncate w-40">A very long single line that does not fit the box</Text>
    <Text class="text-sm text-slate-900 text-justify w-40">justified words fill the width of every line but the last one</Text>
    <Text class="text-sm text-slate-900 text-balance w-40">aaa bbb ccc ddd eee fff ggg hhh</Text>
    <Text class="text-sm text-slate-900 break-words w-20">Supercalifragilistic</Text>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
