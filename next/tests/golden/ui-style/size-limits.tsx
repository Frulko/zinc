// Size constraints (ZN-253): a centred max-w-md column, a 16:9 card grid (aspect-video) and a min-h box.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="flex-col gap-2 p-2 bg-slate-100 w-full">
    <View class="max-w-[160px] mx-auto w-full h-6 bg-indigo-500" />
    <View class="flex-row gap-2 w-full">
      <View class="grow aspect-video bg-red-400" />
      <View class="grow aspect-video bg-green-400" />
      <View class="grow aspect-video bg-blue-400" />
    </View>
    <View class="min-h-[28px] w-24 bg-yellow-400" />
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
