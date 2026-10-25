import { createSignal, render } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
const [score, setScore] = createSignal('0');
function App(): i32 {
  return <View className="flex-col h-full p-6 gap-5 bg-slate-900">
    <Text className="text-2xl font-bold text-amber-200">POCKET RALLY</Text>
    <Text className="text-sm text-slate-200">Zinc navigation · real embedded Godot game</Text>
    <Text className="text-xl text-teal-200">{`Score: ${score()}`}</Text>
    <Button className="p-4 rounded-lg bg-teal-700" onClick={() => console.log('libgodot:pause')}><Text className="text-white">Pause / resume</Text></Button>
    <Button className="p-4 rounded-lg bg-slate-700" onClick={() => console.log('libgodot:faster')}><Text className="text-white">Faster</Text></Button>
    <Button className="p-4 rounded-lg bg-slate-700" onClick={() => console.log('libgodot:reset')}><Text className="text-white">New rally</Text></Button>
    <Text className="text-sm text-slate-300">Up / Down moves the paddle in the game region.</Text>
    <Text className="text-xs text-slate-400">One experimental Godot 4.6 runtime. Desktop OpenGL.</Text>
  </View>;
}
render(App, 0x0f172a, (_dt: number) => {
  const next = env('ZINC_RALLY_SCORE');
  if (next !== score()) setScore(next);
});
