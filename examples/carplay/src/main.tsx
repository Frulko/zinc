import { render, createSignal } from 'zinc:ui/solid';
import { Session } from 'zinc:carplay';
import * as ui from 'zinc:ui';
import { OfflineMedia } from './services/offline';
import { env } from 'zinc:sys';
const session = new Session();
const url = env('ZINC_CARPLAY_URL');
const media = env('ZINC_CARPLAY_MEDIA');
const offline = media !== '' ? new OfflineMedia(session, media) : null;
const [status, setStatus] = createSignal<string>(offline !== null ? 'OFFLINE MEDIA / no iPhone authentication' : 'Live mode: start the receiver, then Connect');
const [night, setNight] = createSignal<boolean>(false);
const [detail, setDetail] = createSignal<string>('');
function connect(): void { if (url !== '' && offline === null) session.connect(url); }
ui.onKey((e: ui.KeyEvent) => {
  if (!e.primary && !e.alt && session.key(e.key)) e.preventDefault();
});
function Screen(x: i32, y: i32, w: i32, h: i32): void { session.view(x, y, w, h); }
function App(): i32 {
  return <View className="flex-col h-full bg-slate-950">
    <View className="flex-row items-center px-6 h-16 gap-4 bg-slate-900">
      <Text className="text-xl text-amber-200">{offline !== null ? 'ZINC / OFFLINE MEDIA' : 'ZINC / CARPLAY LIVE'}</Text>
      <View className="grow"></View>
      {offline === null ? <Button className="px-5 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={connect}><Text className="text-white">Connect</Text></Button> : <Text className="text-slate-400">Local H.264 + PCM test media</Text>}
      {offline === null ? <Button className="px-5 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { session.close(); }}><Text className="text-white">Disconnect</Text></Button> : null}
    </View>
    <Canvas className="grow" onDraw={Screen}></Canvas>
    <View className="flex-row items-center h-20 px-6 gap-4 bg-slate-900">
      {offline === null ? <View className="flex-row gap-4"><Button className="px-6 py-3 rounded bg-amber-200 active:bg-amber-400" onClick={() => { session.home(); }}><Text className="text-slate-950">Home</Text></Button>
      <Button className="px-6 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { session.siri(); }}><Text className="text-white">Siri</Text></Button>
      <Button className="px-6 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { const n = !night(); setNight(n); session.setNightMode(n); }}><Text className="text-white">{night() ? 'Night' : 'Day'}</Text></Button></View> : null}
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
  if (offline !== null) offline.step(dt);
  elapsed += dt;
  if (elapsed < 0.25) return;
  elapsed = 0;
  if (offline === null && url !== '') setStatus(session.status);
  setDetail(session.error !== '' ? session.error : offline !== null ? `${session.width} × ${session.height} / ${session.frames} packets / Local four-second loop · 440 Hz tone` : `${session.width} × ${session.height} / ${session.frames} packets / Arrows · Enter · Esc · Home · S`);
});
