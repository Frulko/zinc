// ui-style scene (ZN-277): justify-align
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-row justify-between items-center p-3 h-24 bg-slate-200"><View class="w-8 h-8 bg-red-500"/><View class="w-8 h-16 bg-green-500"/><View class="w-8 h-4 bg-blue-500"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
