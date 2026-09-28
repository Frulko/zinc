// A minimal Solid UI app: a counter with a button.
//   zinc run docs/guide/samples/hello-ui              # SDL3 window
//   zinc run docs/guide/samples/hello-ui --target wasm
import { createSignal, render } from 'zinc:ui/solid';

const [count, setCount] = createSignal<i32>(0);

function App(): i32 {
  return <view class="flex-col items-center justify-center h-full gap-3 bg-slate-900">
    <text class="text-2xl text-amber-400">count: {count()}</text>
    <button class="px-4 py-2 rounded bg-slate-700 focus:bg-slate-600" onClick={() => setCount(count() + 1)}>
      <text class="text-slate-100">increment</text>
    </button>
  </view>;
}

render(App, 0x0f172a, null);
