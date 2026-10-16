// ui-style scene (ZN-277): text-sizes
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="flex-col p-3 gap-1"><Text className="text-xs text-slate-900">Extra small 0123</Text><Text className="text-sm text-slate-900">Small 0123</Text><Text className="text-base text-slate-900">Base 0123</Text><Text className="text-xl font-bold text-slate-900">Large bold 0123</Text></View>;
}

render(App, 0xffffff, (dt: number) => {});
