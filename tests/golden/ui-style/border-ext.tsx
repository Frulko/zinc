// Border model (ZN-257): dashed and dotted lines, a colour per side, a radius per corner.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View className="flex-col gap-2 p-2 bg-white w-full">
    <View className="flex-row gap-2 w-full">
      <View className="w-20 h-12 border-2 border-dashed border-indigo-600" />
      <View className="w-20 h-12 border-2 border-dotted border-pink-600 rounded-lg" />
      <View className="w-20 h-12 border-4 border-t-red-500 border-r-green-500 border-b-blue-500 border-l-yellow-500" />
    </View>
    <View className="flex-row gap-2 w-full">
      <View className="w-20 h-12 bg-slate-200 rounded-tl-xl rounded-br-xl" />
      <View className="w-20 h-12 border-2 border-slate-700 rounded-t-xl" />
      <View className="w-20 h-12 bg-amber-200 border-2 border-dashed border-amber-700 rounded-tr-full rounded-bl-lg" />
    </View>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
