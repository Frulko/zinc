// Remote viewer: lists the Zinc apps announcing a remote display (this machine, the LAN) and shows the selected one
// live, forwarding pointer, wheel and keys while the mouse is over it.
// Try it: zinc run examples/breakout --display remote     (another terminal)   zinc run examples/remote/viewer
// VIEWER_AUTO=1 connects to the first app found and prints fps / latency / bandwidth every second (scripted runs).
import { createSignal, render, For, Show } from 'zinc:ui/solid';
import * as remote from 'zinc:remote';
import * as sys from 'zinc:sys';

const [apps, setApps] = createSignal<remote.App[]>([]);
const [current, setCurrent] = createSignal<string>('');
const [status, setStatus] = createSignal<string>('looking for apps...');
const [stats, setStats] = createSignal<string>('');
let session: remote.Session | null = null;
const auto = sys.env('VIEWER_AUTO') === '1';

async function open(host: string, port: i32, label: string): Promise<void> {
  const old = session;
  if (old !== null) old.close();
  session = null;
  setCurrent(`${host}:${port}`);
  setStatus(`connecting to ${label}...`);
  try {
    const s = await remote.connect(host, port);
    session = s;
    s.onClose(() => { setStatus(`${label}: connection lost, reconnecting...`); });
    s.onOpen(() => { setStatus(`${s.name} on ${host}:${port}`); });
    setStatus(`${s.name} on ${host}:${port}`);
  } catch (e) {
    setStatus(`${label}: cannot connect`);
    setCurrent('');
  }
}

remote.discover((list: remote.App[]) => {
  setApps(list);
  if (list.length === 0 && session === null) setStatus('no app found - run one with --display remote');
  if (auto && session === null && current() === '' && list.length > 0) open(list[0].host, list[0].port, list[0].name);
});

function Screen(x: i32, y: i32, w: i32, h: i32): void {
  const s = session;
  if (s !== null) s.view(x, y, w, h);
}

function AppRow(a: remote.App, _i: i32): i32 {
  return <Button className={current() === a.key ? 'flex-col p-2 rounded bg-sky-800' : 'flex-col p-2 rounded bg-slate-800 active:bg-slate-600'}
    onClick={() => { open(a.host, a.port, a.name); }}>
    <Text className="text-sm text-white">{a.name}</Text>
    <Text className="text-xs text-slate-400">{`${a.target} · ${a.width}x${a.height} · pid ${a.pid}`}</Text>
    <Text className="text-xs text-slate-500">{a.key}</Text>
  </Button>;
}

function App(): i32 {
  return <View className="flex-row h-full bg-slate-950">
    <View className="flex-col w-60 p-3 gap-2 bg-slate-900">
      <Text className="text-xs text-slate-500 tracking-wider">APPS</Text>
      <For each={apps()}>{(a: remote.App, i: i32) => AppRow(a, i)}</For>
      <Show when={apps().length === 0}><Text className="text-xs text-slate-500">none yet</Text></Show>
      <View className="grow"></View>
      <Button className="px-2 py-1 h-8 rounded bg-slate-700 active:bg-slate-500" onClick={() => { open('127.0.0.1', 7700, 'localhost:7700'); }}>
        <Text className="text-sm">localhost:7700</Text>
      </Button>
    </View>
    <View className="flex-col grow">
      <Canvas className="grow" onDraw={Screen}></Canvas>
      <View className="flex-row items-center gap-3 px-3 h-7 bg-slate-900">
        <Text className="text-xs text-slate-400">{status()}</Text>
        <View className="grow"></View>
        <Text className="text-xs text-emerald-400">{stats()}</Text>
      </View>
    </View>
  </View>;
}

let acc = 0;
render(App, 0x020617, (dt: number) => {
  acc += dt;
  if (acc < 1) return;
  acc = 0;
  const s = session;
  if (s === null || !s.connected) { setStats(''); return; }
  const line = `${s.fps.toFixed(0)} fps · ${s.latency.toFixed(1)} ms rtt · ${s.kbps.toFixed(1)} KiB/s · ${s.width}x${s.height}`;
  setStats(line);
  if (auto) console.log('viewer:', s.name, line, 'frames', s.frames);
});
