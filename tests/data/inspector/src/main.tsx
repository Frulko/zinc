// The program tests/t1/inspector.sh inspects with the Zinc Inspector (ZN-373.01): a small tree with a padding class and text, and a console
// that prints a line every 200 ms and one error; with INSPECTOR_FETCH (ZN-373.03) a POST to that URL, answered by tests/netlog_servers.py.
// Components with props (<Card>, <Squares>) for the component tree of a dev run, a node with display: none and a list of 2,000 rows of
// which only those in its view draw, for the "rendered only" filter; a row with a long className (an iPod menu item) that Elements wraps.
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import { fetch } from 'zinc:net';
import { WebSocket, MessageEvent } from 'zinc:socket';
import * as sys from 'zinc:sys';

let n = 0;
setInterval(() => {
  n++;
  console.log('tick ' + n);
  if (n === 2) console.error('oops ' + n);
}, 200);

function Squares(p: { gap: i32 }): i32 {
  return <View className="flex-row gap-1"><View className="w-4 h-4 bg-rose-600" /><View className="w-4 h-4 bg-sky-600" /></View>;
}
function Card(p: { title: string }): i32 {
  return <View className="flex-col p-2 rounded bg-slate-100">
    <Text className="text-sm">{p.title}</Text>
    <Squares gap={1} />
  </View>;
}
function App(): i32 {
  return <View className="flex-col gap-2 p-4">
    <Text className="text-lg">Hello inspector</Text>
    <Card title="First card" />
    <View className="hidden"><Text>Never shown</Text></View>
    <VirtualList count={2000} itemHeight={20} className="h-16">
      {(i: i32) => <Text className="text-xs">{'Row ' + i}</Text>}
    </VirtualList>
    <View className="flex-row items-center justify-between px-3 py-1 rounded-md border-b border-slate-200 bg-white cursor-pointer hover:bg-slate-200 active:bg-slate-300 transition-colors duration-150">
      <Text className="text-sm font-medium text-slate-900">Now Playing</Text>
      <Text className="text-xs text-slate-500">3:42</Text>
    </View>
  </View>;
}
render(App, 0xffffff, (dt: number) => {});

async function post(url: string): Promise<void> {
  const r = await fetch(url, { method: 'POST', body: '{"ask":"inspector"}', contentType: 'application/json' });
  console.log('fetched ' + r.status + ' ' + await r.text());
}
if (sys.env('INSPECTOR_FETCH') !== '') post(sys.env('INSPECTOR_FETCH'));
// a WebSocket to the same server (its /ws echoes): one message each way, then closed
if (sys.env('INSPECTOR_FETCH') !== '') {
  const ws = new WebSocket(sys.env('INSPECTOR_FETCH').replace('http://', 'ws://').replace('/echo', '/ws'));
  ws.onopen = () => { ws.send('hello'); };
  ws.onmessage = (e: MessageEvent) => { console.log('ws ' + e.data); ws.close(); };
}
