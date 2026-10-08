// Ring and outline (ZN-258): static rings, an offset, an outline, and focus-visible: after keyboard focus.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="flex-col gap-4 p-4 bg-white w-full">
    <View class="flex-row gap-4 w-full">
      <View class="w-16 h-10 bg-slate-200 rounded-lg ring-2 ring-indigo-500 ring-offset-2" />
      <View class="w-16 h-10 bg-slate-200 outline-2 outline-red-500 outline-offset-1" />
      <View focusable onClick={() => {}} class="w-16 h-10 bg-slate-200 rounded-lg focus-visible:ring-4 focus-visible:ring-green-500" />
    </View>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => {
  n++;
  if (n === 2) ui.keyDown(-1, 'Tab');
  if (n >= 4) quit();
});
