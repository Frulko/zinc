// tests/t1/busy_spinner.sh: the baseline of the threads work (docs/reports/threads-ui-compute-animation.md, step 0). A kit Spinner turns
// while, at frame 30, the program's own thread busy-waits 2 s, as a heavy computation on the UI thread does: the profiler's
// present_interval shows the gap the user sees (one ~2000 ms interval today, no frame at all while the script works).
import { render } from 'zinc:ui/solid';
import { Spinner } from 'zinc:ui/kit';

let frames = 0;
function busy(ms: number): void {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {}
}

function App(): i32 {
  return <View className="flex-col h-full items-center justify-center bg-white">
    <Spinner size={48} color={() => 0x2563eb} active={() => true} />
  </View>;
}

render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 30) { busy(2000); console.log('busy done'); }
});
