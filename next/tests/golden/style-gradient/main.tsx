// Gradients (ZN-261): Tailwind v4's bg-linear-* / bg-radial / bg-conic with from- / via- / to- and their positions, CSS gradient functions
// in bg-[..] and backgroundImage, repeating and rounded. Row 1: the three-stop vertical gradient (chained two-stop rects) beside the same
// gradient made of two stacked bg-gradient-to-b boxes (the test compares them), 45 degrees, towards a corner, positions on a rounded box,
// repeating stripes. Row 2: radial (ellipse, circle at a corner, CSS with a transparent end over a colour), conic, backgroundImage.
import { StyleSheet } from 'zinc:ui';
import { render } from 'zinc:ui/solid';

const box = 'w-[96px] h-[96px]';
const s = StyleSheet.create({ card: { width: 96, height: 96, backgroundImage: 'linear-gradient(135deg, #f43f5e, #8b5cf6 60%, #06b6d4)', borderRadius: 16 } });
function App(): i32 {
  return <View className="flex flex-col gap-[16px] p-[16px] bg-white">
    <View className="flex flex-row gap-[16px]">
      <View className="w-[64px] h-[128px] bg-linear-to-b from-red-500 via-green-500 to-blue-500" />
      <View className="w-[64px] h-[128px] flex flex-col">
        <View className="w-[64px] h-[64px] bg-gradient-to-b from-red-500 to-green-500" />
        <View className="w-[64px] h-[64px] bg-gradient-to-b from-green-500 to-blue-500" />
      </View>
      <View className={`${box} bg-linear-45 from-indigo-500 via-purple-500 to-pink-500`} />
      <View className={`${box} bg-linear-to-tr from-yellow-400 to-red-500 rounded-xl`} />
      <View className={`${box} bg-linear-to-r from-sky-500 from-10% via-emerald-500 via-30% to-indigo-500 to-90% rounded-lg`} />
      <View className={`${box} bg-[repeating-linear-gradient(45deg,#111827_0_10px,#f59e0b_10px_20px)]`} />
    </View>
    <View className="flex flex-row gap-[16px]">
      <View className={`${box} bg-radial from-white to-blue-600`} />
      <View className={`${box} bg-radial-[at_25%_25%] from-white to-zinc-900 to-75% rounded-full`} />
      <View className={`${box} bg-slate-800 bg-[radial-gradient(circle_at_center,#fde047,#f97316_50%,transparent_70%)]`} />
      <View className={`${box} bg-conic from-red-500 via-green-500 to-red-500 rounded-full`} />
      <View className={`${box} bg-conic-180 from-indigo-600 via-indigo-50 to-indigo-600`} />
      <View style={s.card} />
      <View className={`${box} bg-amber-300 bg-linear-to-b from-transparent to-black/60`} />
    </View>
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
