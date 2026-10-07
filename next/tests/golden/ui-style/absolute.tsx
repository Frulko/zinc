// ui-style scene (ZN-277): absolute
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="w-32 h-32 m-3 bg-slate-200"><View class="absolute top-2 left-2 w-8 h-8 bg-red-500"/><View class="absolute bottom-2 right-2 w-8 h-8 bg-blue-500"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
