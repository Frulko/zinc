// ui-style scene (ZN-277): border
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-row p-3 gap-3"><View class="w-16 h-16 border border-slate-800 bg-white"/><View class="w-16 h-16 border-2 border-red-500 rounded-lg bg-white"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
