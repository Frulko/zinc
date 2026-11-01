// E-ink style mode (ZN-929, run with ZINC_EINK=1): a card with a gradient, a shadow, an opacity, a tinted box and the four pattern fills.
// Colours snap to black, white and the Gallery 3 primaries; no gradient, shadow or alpha command is issued.
import { einkDroppedCount } from 'zinc:ui';
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="flex-col gap-4 p-4 w-full bg-white">
    <View className="w-64 h-24 rounded-xl shadow-lg bg-gradient-to-r from-indigo-500 to-pink-500 p-3">
      <Text className="text-white text-xl font-bold">Gradient card</Text>
    </View>
    <View className="w-64 h-12 bg-sky-200 opacity-50 rounded"><Text className="text-slate-500 text-lg">Faded and tinted</Text></View>
    <View className="flex-row gap-3">
      <View className="w-20 h-20 border-2 border-black pattern-hatch" />
      <View className="w-20 h-20 border-2 border-black pattern-cross rounded-lg" />
      <View className="w-20 h-20 border-2 border-black pattern-dots" />
      <View className="w-20 h-20 border-2 border-black pattern-stripes" />
      <View className="w-20 h-20 border-2 border-red-500 bg-red-500" />
    </View>
  </View>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => { if (++frames === 3) console.log('dropped', einkDroppedCount()); });
