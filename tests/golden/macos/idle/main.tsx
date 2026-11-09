// A zinc:ui window where nothing moves (tests/t1/idle_sleep.sh, ZN-805): once settled, its loop sleeps until an event or a timer instead of
// turning 60 times a second. Prints the loop's turns a second while idle and how late a one-second timer fired, then quits.
import { render, createSignal } from 'zinc:ui/solid';
import * as system from 'zinc:system';
import * as window from 'zinc:system/window';

const t0 = performance.now();
const [label, setLabel] = createSignal<string>('Hello');
let phase = 0, frames = 0, idleFrom = 0, due = 0;

function App(): i32 {
  return <View className="w-full h-full items-center justify-center bg-white">
    <Text className="text-xl">{label()}</Text>
  </View>;
}

render(App, 0xffffff, (dt: number) => {
  const now = performance.now();
  frames++;
  if (phase === 0 && now - t0 > 300) { phase = 1; window.setAlwaysOnTop(true); window.setPosition(40, 60); }   // seen: above the other windows, without the focus
  else if (phase === 1 && now - t0 > 1500) {
    phase = 2; frames = 0; idleFrom = now; due = now + 1000;
    setTimeout(() => {
      const at = performance.now();
      console.log('idle ' + (frames / ((at - idleFrom) / 1000)).toFixed(1) + ' turns/s, timer late ' + (at - due).toFixed(1) + ' ms');
      setLabel('Done');
      setTimeout(() => system.quit(0), 200);
    }, 1000);
  }
});
