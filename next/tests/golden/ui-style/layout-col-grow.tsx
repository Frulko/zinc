// ui-style scene (ZN-277): layout-col-grow
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-col p-3 gap-2 h-full"><View class="h-8 bg-slate-300"/><View class="flex-1 bg-slate-400"/><View class="h-8 bg-slate-500"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
