// tests/t1/busy_worker.sh: tests/data/busy_spinner with its 2 s computation in a worker (zinc:worker, D181). The Spinner keeps turning:
// every present interval stays under a 60 Hz frame while the worker computes.
import { render } from 'zinc:ui/solid';
import { Spinner } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
import { Worker } from 'zinc:worker';

const w = new Worker<number, number>(new URL('./work.ts', import.meta.url));
let frames = 0;
let during = 0;
let waiting = false;
w.onmessage = (e: MessageEvent<number>) => {
  console.log('worker done, ' + (during > 30 ? 'frames kept coming' : 'only ' + during + ' frames meanwhile'));
  quit();
};

function App(): i32 {
  return <View className="flex-col h-full items-center justify-center bg-white">
    <Spinner size={48} color={() => 0x2563eb} active={() => true} />
  </View>;
}

render(App, 0xffffff, (dt: number) => {
  frames++;
  if (waiting) during++;
  if (frames === 30) { w.postMessage(2000); waiting = true; }
});
