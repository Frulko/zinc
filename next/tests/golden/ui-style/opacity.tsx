// ui-style scene (ZN-277): opacity
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-row p-3 gap-3 bg-slate-800"><View class="w-16 h-16 bg-white"/><View class="w-16 h-16 bg-white opacity-50"/><View class="w-16 h-16 bg-white opacity-25"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
