// tests/t1/inspector_threads.sh: a UI program with zinc:devtools whose worker gets a job every 100 ms. The Zinc Inspector lists the worker in its
// Threads view and records a track per thread in Performance; ZINC_TRACE writes the same tracks to a file (THREADS_QUIT: after 5 replies).
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import * as sys from 'zinc:sys';
import { Worker, MessageEvent } from 'zinc:worker';
import { Job, Done } from './types';

const w = new Worker<Job, Done>(new URL('./work.ts', import.meta.url));
let next = 0;
let done = 0;
w.onmessage = (e: MessageEvent<Done>) => { done++; if (done === 5 && sys.env('THREADS_QUIT') !== '') quit(); };   // ZINC_TRACE: a few messages, then the trace is written
setInterval(() => { next++; w.postMessage({ id: next, n: 20000 }); }, 100);

function App(): i32 {
  return <View className="flex-col gap-2 p-4">
    <Text className="text-lg">Threads</Text>
    <View className="w-8 h-8 bg-sky-600" />
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
