// ui-style scene (ZN-277): wrap
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-row flex-wrap p-3 gap-2 w-48"><View class="w-16 h-8 bg-red-400"/><View class="w-16 h-8 bg-green-400"/><View class="w-16 h-8 bg-blue-400"/><View class="w-16 h-8 bg-yellow-400"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
