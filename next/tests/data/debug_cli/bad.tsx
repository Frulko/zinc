// a type error inside a JSX element, reported at its own line and column (ZN-371.03)
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <view class="p-2">
    <text>
      {missing + 1}
    </text>
  </view>;
}
render(App, 0xffffff, (dt: number) => {});
