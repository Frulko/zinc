// The kit's Spinner while the script is busy (D182 step 6, tests/t1/busy_spinner.sh): at frame 60 the frame callback busy-waits 2 s; the
// compositor keeps turning the spinner on the render thread meanwhile, so the presents keep their pace.
import { render } from 'zinc:ui/solid';
import { Spinner } from 'zinc:ui/kit';

function App(): i32 {
  return <View style={{ padding: 40 }}>
    <Spinner size={64} color={() => 0x2563eb} active={() => true} />
  </View>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  if (++frames !== 60) return;
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {}
  console.log('busy for 2 s');
});
