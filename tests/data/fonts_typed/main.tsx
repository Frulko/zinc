// Characters typed at run time (ZN-669): the text field receives, through ZINC_INPUT (typed.input), letters that are in no file the baker reads
// (Greek, Cyrillic). The program has a text field, so its embedded fonts keep every character; the baked size lacks them, so the field draws in
// the twin of its font rasterized from the file, with the same pixels for the other letters. tests/t1/fonts_runtime.sh checks the frame.
import { createSignal, render } from 'zinc:ui/solid';

const [value, setValue] = createSignal<string>('');
function App(): i32 {
  return <View className="flex-col gap-3 p-6 h-full">
    <Text className="text-sm text-slate-600">Type here</Text>
    <Input className="w-72 h-10 px-2 rounded-md border border-slate-300 bg-white text-base text-slate-900" value={value()} onInput={(v: string) => { setValue(v); console.log(`typed ${v.length} characters`); }} />
  </View>;
}
render(App, 0xffffff, null);
