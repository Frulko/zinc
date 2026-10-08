// Stacking (ZN-255): z-index reorders overlapping boxes, invisible keeps the room, relative shifts a box without moving its neighbours.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="flex-col gap-2 p-2 bg-slate-100 w-full">
    <View class="flex-row w-full h-10">
      <View class="w-16 h-10 bg-red-500 z-10" /><View class="w-16 h-10 bg-green-500 -ml-8" /><View class="w-16 h-10 bg-blue-500 -ml-4 z-20" />
    </View>
    <View class="flex-row gap-1 w-full h-6">
      <View class="w-12 h-6 bg-red-500" /><View class="w-12 h-6 bg-green-500 invisible" /><View class="w-12 h-6 bg-blue-500" />
    </View>
    <View class="flex-row gap-1 w-full h-8">
      <View class="w-12 h-6 bg-red-500" /><View class="w-12 h-6 bg-green-500 relative top-2 left-3" /><View class="w-12 h-6 bg-blue-500" />
    </View>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
