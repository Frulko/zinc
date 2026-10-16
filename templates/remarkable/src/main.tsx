import { createSignal, render } from 'zinc:ui/solid';
import { Ink, InkCanvas } from 'zinc:ink';

const ink = new Ink();
const [strokes, setStrokes] = createSignal<i32>(0);

function App(): i32 {
  return <View className="flex-col h-full bg-white">
    <View className="flex-row items-center gap-6 p-6">
      <Text className="text-[48px] font-bold text-black">My app</Text>
      <Button className="px-6 py-4 rounded-lg border-2 border-black bg-white focus:bg-white" onClick={() => { ink.undo(); setStrokes(ink.strokes.length); }}>
        <Text className="text-[34px] text-black">Undo</Text>
      </Button>
      <Text className="text-[34px] text-gray-600">{strokes()} stroke(s)</Text>
    </View>
    <View className="h-[3px] bg-black"></View>
    <InkCanvas ink={ink} className="grow" />
  </View>;
}

render(App, 0xffffff, (dt: number) => { if (ink.strokes.length !== strokes()) setStrokes(ink.strokes.length); });
