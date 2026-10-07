// ui-style scene (ZN-277): shadow
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-row p-6 gap-6 bg-slate-100"><View class="w-16 h-16 bg-white rounded-lg shadow"/><View class="w-16 h-16 bg-white rounded-lg shadow-lg"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
