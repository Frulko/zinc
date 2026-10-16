// Auto and negative margins (ZN-252): mx-auto centres a box, ml-auto pushes the last one to the end, -mt-2 pulls a box up under its neighbour.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View className="flex-col gap-2 p-2 bg-white w-full">
    <View className="w-24 h-6 bg-indigo-500 mx-auto" />
    <View className="flex-row w-full"><View className="w-12 h-6 bg-green-500" /><View className="w-12 h-6 bg-red-500 ml-auto" /></View>
    <View className="w-20 h-6 bg-yellow-500" />
    <View className="w-20 h-6 bg-purple-500 -mt-2 ml-6" />
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
