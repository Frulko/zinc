// Synthetic italic and weights (ZN-267): the baked slant of the sans faces.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="flex-col gap-1 p-3 bg-white w-full">
    <Text class="text-lg text-slate-900">Upright text</Text>
    <Text class="text-lg text-slate-900 italic">Italic text</Text>
    <Text class="text-lg text-slate-900 font-bold italic">Bold italic</Text>
    <Text class="text-lg text-slate-900 font-medium">Medium is regular</Text>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
