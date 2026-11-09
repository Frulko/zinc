// ui-style scene (ZN-260): box shadows beyond the presets: two layers with a spread, a coloured hard layer, Tailwind's inset-shadow-sm, an
// inset with an offset inside a border, inset-shadow-<colour> over an arbitrary inset, an inset whose spread fills the box
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="flex-row flex-wrap p-4 gap-5 bg-slate-100">
    <View className="w-14 h-12 bg-white rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_12px_-2px_rgba(0,0,0,0.25)]"/>
    <View className="w-14 h-12 bg-white rounded-xl shadow-[4px_4px_0_2px_#6366f1]"/>
    <View className="w-14 h-12 bg-white rounded-lg inset-shadow-sm"/>
    <View className="w-14 h-12 bg-sky-100 rounded-lg border-2 border-sky-500 shadow-[inset_3px_4px_6px_rgb(0_0_0_/_0.4)]"/>
    <View className="w-14 h-12 bg-white rounded-full inset-shadow-[0_2px_8px_-1px_black] inset-shadow-rose-500/60"/>
    <View className="w-14 h-12 bg-white rounded-md inset-shadow-[0_0_0_40px_#22c55e] shadow-md"/>
  </View>;
}

render(App, 0xffffff, (dt: number) => {});
