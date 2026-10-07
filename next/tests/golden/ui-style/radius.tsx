// ui-style scene (ZN-277): radius
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-row p-3 gap-3"><View class="w-16 h-16 bg-blue-500 rounded"/><View class="w-16 h-16 bg-blue-500 rounded-lg"/><View class="w-16 h-16 bg-blue-500 rounded-full"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
