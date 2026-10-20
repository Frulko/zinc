// ui-style scene (ZN-277): text-colors
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="flex-col p-3 gap-1 bg-slate-900"><Text className="text-base text-white">White</Text><Text className="text-base text-red-400">Red</Text><Text className="text-base text-green-400">Green</Text></View>;
}

render(App, 0xffffff, (dt: number) => {});
