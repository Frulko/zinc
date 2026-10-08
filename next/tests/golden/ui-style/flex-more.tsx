// Flex completeness (ZN-254): order, self-end, basis-0 with grow (equal columns) against legacy flex-1, row-reverse, shrink, align-content, column wrap.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="flex-col gap-1 p-1 bg-slate-100 w-full">
    <View class="flex-row gap-1 w-full h-6">
      <View class="order-2 w-8 bg-red-500" /><View class="order-1 w-8 bg-green-500" /><View class="w-8 bg-blue-500" />
    </View>
    <View class="flex-row gap-1 w-full h-8 items-start">
      <View class="w-8 h-4 bg-red-500" /><View class="w-8 h-4 bg-green-500 self-center" /><View class="w-8 h-4 bg-blue-500 self-end" />
    </View>
    <View class="flex-row gap-1 w-full h-5">
      <View class="basis-0 grow bg-red-500" /><View class="basis-0 grow-[2] bg-green-500" /><View class="basis-0 grow bg-blue-500" />
    </View>
    <View class="flex-row-reverse gap-1 w-full h-5">
      <View class="w-8 bg-red-500" /><View class="w-8 bg-green-500" /><View class="w-8 bg-blue-500" />
    </View>
    <View class="flex-row gap-1 w-24 h-5">
      <View class="w-16 shrink bg-red-500" /><View class="w-16 shrink bg-green-500" />
    </View>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
