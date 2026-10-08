// Typography B (ZN-268): underline, line-through, text-transform, word spacing, sub/superscript shift.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="flex-col gap-1 p-3 bg-white w-full">
    <Text class="text-base text-slate-900 underline">Underlined text</Text>
    <Text class="text-base text-slate-900 line-through">Struck text</Text>
    <Text class="text-base text-slate-900 uppercase">Upper été ß</Text>
    <Text class="text-base text-slate-900 capitalize">title case words</Text>
    <Text class="text-base text-slate-900 word-8 underline">spaced out words</Text>
    <Text class="text-base text-slate-900 align-super">super</Text>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
