import { render, createSignal } from 'zinc:ui/solid';
import { Session } from 'zinc:carplay';
import { env } from 'zinc:sys';
const session = new Session();
const url = env('ZINC_CARPLAY_URL');
const [status, setStatus] = createSignal<string>('Set ZINC_CARPLAY_URL to the receiver WebSocket URL');
const [night, setNight] = createSignal<boolean>(false);
const [detail, setDetail] = createSignal<string>('');
function connect(): void { if (url !== '') session.connect(url); }
function Screen(x: i32, y: i32, w: i32, h: i32): void { session.view(x, y, w, h); }
function App(): i32 {
  return <View className="flex-col h-full bg-slate-950">
    <View className="flex-row items-center px-6 h-16 gap-4 bg-slate-900">
      <Text className="text-xl text-amber-200">ZINC / CARPLAY</Text>
      <View className="grow"></View>
      <Button className="px-5 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={connect}><Text className="text-white">Connect</Text></Button>
      <Button className="px-5 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { session.close(); }}><Text className="text-white">Disconnect</Text></Button>
    </View>
    <Canvas className="grow" onDraw={Screen}></Canvas>
    <View className="flex-row items-center h-20 px-6 gap-4 bg-slate-900">
      <Button className="px-6 py-3 rounded bg-amber-200 active:bg-amber-400" onClick={() => { session.home(); }}><Text className="text-slate-950">Home</Text></Button>
      <Button className="px-6 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { session.siri(); }}><Text className="text-white">Siri</Text></Button>
      <Button className="px-6 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { const n = !night(); setNight(n); session.setNightMode(n); }}><Text className="text-white">{night() ? 'Night' : 'Day'}</Text></Button>
      <View className="flex-col grow gap-1">
        <Text className="text-sm text-white">{status()}</Text>
        <Text className="text-xs text-slate-400">{detail()}</Text>
      </View>
    </View>
  </View>;
}
connect();
let elapsed = 0;
render(App, 0x0c0a09, (dt: number) => {
  elapsed += dt;
  if (elapsed < 0.25) return;
  elapsed = 0;
  if (url !== '') setStatus(session.status);
  setDetail(session.error !== '' ? session.error : `${session.width} × ${session.height} / ${session.frames} packets`);
});
