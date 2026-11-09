// ui-style scene (ZN-260): the five shadow presets, drawn as before the layered and inset shadows (bit-exact)
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="flex-row flex-wrap p-4 gap-5 bg-slate-100">
    <View className="w-12 h-12 bg-white rounded-md shadow-sm"/><View className="w-12 h-12 bg-white rounded-md shadow"/>
    <View className="w-12 h-12 bg-white rounded-md shadow-md"/><View className="w-12 h-12 bg-white rounded-md shadow-lg"/>
    <View className="w-12 h-12 bg-white rounded-md shadow-xl"/>
  </View>;
}

render(App, 0xffffff, (dt: number) => {});
