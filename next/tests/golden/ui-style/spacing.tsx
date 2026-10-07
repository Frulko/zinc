// ui-style scene (ZN-277): spacing
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-col p-6 gap-4 bg-slate-100"><View class="p-2 bg-white"><View class="h-4 bg-slate-400"/></View><View class="p-4 bg-white"><View class="h-4 bg-slate-400"/></View></View>;
}

render(App, 0xffffff, (dt: number) => {});
