// perf-compare: the same four screens as the Flutter / React Native / Lynx twins in ../.
// ZINC_DEMO=hello | list | anim | input picks one; each scripted mode drives itself frame by frame.
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';

const mode = env('ZINC_DEMO') === '' ? 'hello' : env('ZINC_DEMO');
const [count, setCount] = createSignal<i32>(0);
const [text, setText] = createSignal<string>('');
const inputRef = createNodeRef();
const rows: i32[] = [];
for (let i = 0; i < 1000; i++) rows.push(i);

function Hello(): i32 {
  return <View className="flex-col items-center justify-center h-full bg-white">
    <Text className="text-2xl font-bold text-slate-900">Hello, perf</Text>
  </View>;
}

function List(): i32 {
  return <ScrollView className="h-full bg-white">
    {rows.map((i: i32) => <View className="flex-row items-center h-12 px-4 border-b border-slate-200">
      <Text className="text-base text-slate-800">{`Row ${i}`}</Text>
    </View>)}
  </ScrollView>;
}

function Anim(): i32 {
  return <View className="flex-col items-center justify-center gap-4 h-full bg-white">
    <Text className="text-4xl font-bold text-slate-900">{`${count()}`}</Text>
    <View className="w-64 h-4 bg-slate-200 rounded-full">
      <View className="h-4 bg-blue-500 rounded-full" style={{ width: count() % 256 }} />
    </View>
  </View>;
}

function InputScreen(): i32 {
  return <View className="flex-col gap-3 p-6 h-full bg-white">
    <Input ref={inputRef} className="bg-slate-800 border text-[14px] px-2 py-1.5 text-slate-100 h-10 rounded-lg border-slate-300" placeholder="type here" value={text()} onInput={(v: string) => setText(v)} />
    <Text className="text-base text-slate-700">{`${text().length} chars`}</Text>
  </View>;
}

function App(): i32 {
  if (mode === 'list') return List();
  if (mode === 'anim') return Anim();
  if (mode === 'input') return InputScreen();
  return Hello();
}

let frame = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (mode === 'anim') setCount(frame);
  if (mode === 'list') ui.wheelAt(400, 300, frame % 400 < 200 ? 40 : -40);   // down 200 frames, back up 200
  if (mode === 'input') {
    if (frame === 3) ui.focusNode(inputRef.node);
    if (frame > 3) ui.typeText(inputRef.node, 'x');
  }
});
