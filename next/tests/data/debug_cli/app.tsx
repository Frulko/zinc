// zinc debug in a .tsx file (ZN-371.03): the lines inside and after JSX elements are the file's own.
import { render } from 'zinc:ui/solid';

function label(n: number): string {
  const text = 'count ' + n;
  return text;
}

function App(): i32 {
  const n = 3;
  return <view class="p-2">
    <text>{label(n)}</text>
    <text>{(() => {
      const k = n * 2;
      return label(k);
    })()}</text>
  </view>;
}

render(App, 0xffffff, (dt: number) => {});
const after = 1;
console.log('after', after);
