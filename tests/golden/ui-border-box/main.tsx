// Borders take layout space (ZN-882), as CSS's border-box and Yoga: a ring around an avatar grows by its border, the children of a fixed-size
// bordered box sit inside the border, per-side borders inset their own side, and box-content adds padding and border to the size it is given.
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="flex-row items-start gap-4 p-4 bg-white">
    <View className="rounded-full border-4 border-[#23a55a]"><View className="w-10 h-10 rounded-full bg-[#5865f2]" /></View>
    <View className="w-16 h-16 border-4 border-[#23a55a]"><View className="grow bg-[#5865f2]" /></View>
    <View className="w-16 h-16 border-l-8 border-t-2 border-[#23a55a]"><View className="grow bg-[#5865f2]" /></View>
    <View className="box-content w-8 h-8 p-1 border-4 border-[#23a55a]"><View className="grow bg-[#5865f2]" /></View>
    <View className="border-2 border-[#23a55a] p-1"><Text className="text-sm text-black">Ring</Text></View>
  </View>;
}
render(App, 0xffffff, null);
