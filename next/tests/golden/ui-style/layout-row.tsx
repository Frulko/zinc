// ui-style scene (ZN-277): layout-row
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-row p-3 gap-2"><View class="w-16 h-16 bg-red-500"/><View class="w-16 h-16 bg-green-500"/><View class="w-16 h-16 bg-blue-500"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
