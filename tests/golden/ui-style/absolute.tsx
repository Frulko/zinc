// ui-style scene (ZN-277): absolute
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="w-32 h-32 m-3 bg-slate-200"><View className="absolute top-2 left-2 w-8 h-8 bg-red-500"/><View className="absolute bottom-2 right-2 w-8 h-8 bg-blue-500"/></View>;
}

render(App, 0xffffff, (dt: number) => {});
