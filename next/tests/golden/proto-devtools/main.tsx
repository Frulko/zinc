// Built by the prototype toolchain in tests/t1/proto_devtools.sh (ZN-637): a zinc:ui program that opts in to the inspector of plugins/devtools.
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View class="flex-col p-3 gap-2"><Text class="text-lg">Hello devtools</Text><View class="p-2 bg-sky-600"><Text>inspect me</Text></View></View>;
}
render(App, 0xf1f5f9, (dt: number) => {});
console.log('devtools app up');
