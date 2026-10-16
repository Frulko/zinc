// The program tests/t1/inspector.sh inspects with the Zinc Inspector (ZN-373.01): a small tree with a padding class and text, and a console
// that prints a line every 200 ms and one error; with INSPECTOR_FETCH (ZN-373.03) a POST to that URL, answered by tests/netlog_servers.py.
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import { fetch } from 'zinc:net';
import * as sys from 'zinc:sys';

let n = 0;
setInterval(() => {
  n++;
  console.log('tick ' + n);
  if (n === 2) console.error('oops ' + n);
}, 200);

function App(): i32 {
  return <View className="flex-col gap-2 p-4">
    <Text className="text-lg">Hello inspector</Text>
    <View className="flex-row gap-1"><View className="w-4 h-4 bg-rose-600" /><View className="w-4 h-4 bg-sky-600" /></View>
  </View>;
}
render(App, 0xffffff, (dt: number) => {});

async function post(url: string): Promise<void> {
  const r = await fetch(url, { method: 'POST', body: '{"ask":"inspector"}', contentType: 'application/json' });
  console.log('fetched ' + r.status + ' ' + await r.text());
}
if (sys.env('INSPECTOR_FETCH') !== '') post(sys.env('INSPECTOR_FETCH'));
