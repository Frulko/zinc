// ui-style scene (ZN-277): overflow-clip
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="w-24 h-24 m-3 overflow-hidden rounded-lg bg-slate-200"><View class="w-32 h-32 bg-red-500"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
