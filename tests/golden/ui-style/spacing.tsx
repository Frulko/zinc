// ui-style scene (ZN-277): spacing
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="flex-col p-6 gap-4 bg-slate-100"><View className="p-2 bg-white"><View className="h-4 bg-slate-400"/></View><View className="p-4 bg-white"><View className="h-4 bg-slate-400"/></View></View>;
}

render(App, 0xffffff, (dt: number) => {});
