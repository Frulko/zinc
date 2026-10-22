// Typed text and keys from the HAL reach a zinc:ui text field: click it, type, delete one character, type again.
import { createSignal, render } from 'zinc:ui/solid';

const [txt, setTxt] = createSignal<string>('');

function App(): i32 {
  return <View className="flex-col p-3 gap-2 bg-white">
    <Text className="text-sm text-slate-600">Type here:</Text>
    <Input className="bg-slate-800 border-slate-600 text-[14px] py-1.5 text-slate-100 w-full h-8 px-2 border rounded" value={txt()} onInput={(v: string) => setTxt(v)} />
    <Text className="text-lg font-bold text-slate-900">{txt()}</Text>
  </View>;
}

render(App, 0xffffff, (dt: number) => {});
