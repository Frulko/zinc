// tests/t1/inspector_info.sh: a UI program with zinc:devtools, a worker that gets a job every 100 ms and a value in zinc:storage. The Zinc
// Inspector's Info view describes it: zinc.json, the engine, the renderer, the plugin, the files, the zinc: modules imported, the worker.
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import { set } from 'zinc:storage';
import { Worker, MessageEvent } from 'zinc:worker';
import { Job, Done } from './types';

const w = new Worker<Job, Done>(new URL('./work.ts', import.meta.url));
let next = 0;
w.onmessage = (e: MessageEvent<Done>) => {};
setInterval(() => { next++; w.postMessage({ id: next, n: 20000 }); }, 100);
set('runs', 'one');

function App(): i32 {
  return <View className="flex-col gap-2 p-4">
    <Text className="text-lg">Info</Text>
    <View className="w-8 h-8 bg-sky-600" />
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
