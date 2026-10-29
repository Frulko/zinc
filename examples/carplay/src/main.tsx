import { render, createSignal } from 'zinc:ui/solid';
import { Session } from 'zinc:carplay';
import * as ui from 'zinc:ui';
import { OfflineMedia } from './services/offline';
import { env } from 'zinc:sys';
import { DebugPanel, tickDebug } from './components/DebugPanel';
import { KeyboardCapture, installKeyboardCapture } from './services/keyboard';
import { TouchOverlay } from './components/TouchOverlay';
import { Iap2Panel, tickIap2 } from './components/Iap2Panel';
import { HudPanel, tickHud } from './components/HudPanel';
import { VehicleDashboard, tickVehicle } from './components/VehicleDashboard';
import { DevicesPanel, tickDevices } from './components/DevicesPanel';
const session = new Session();
session.setNativeTouchEnabled(false);
const url = env('ZINC_CARPLAY_URL');
const media = env('ZINC_CARPLAY_MEDIA');
const offline = media !== '' ? new OfflineMedia(session, media) : null;
const [status, setStatus] = createSignal<string>(offline !== null ? 'OFFLINE MEDIA / no iPhone authentication' : 'Live mode: start the receiver, then Connect');
const [debug, setDebug] = createSignal<boolean>(env('ZINC_CARPLAY_DEBUG') === '1');
const [inspector, setInspector] = createSignal<boolean>(false);
const [hudShown, setHudShown] = createSignal<boolean>(true);
const [dashboard, setDashboard] = createSignal<boolean>(false);
const [devices, setDevices] = createSignal<boolean>(false);
const [night, setNight] = createSignal<boolean>(false);
const [detail, setDetail] = createSignal<string>('');
const [trackpad, setTrackpad] = createSignal<boolean>(false);
const [captured, setCaptured] = createSignal<boolean>(true);
const touchOverlay = new TouchOverlay();
const keyboard = new KeyboardCapture((key: string) => { session.key(key); }, (active: boolean) => {
  setCaptured(active);
});

function connect(): void { if (url !== '' && offline === null) session.connect(url); }
function toggleTrackpad(): void {
  const on = !trackpad(); setTrackpad(on); session.setNativeTouchEnabled(on);
}
const handleKey: (e: ui.KeyEvent) => void = offline === null ? installKeyboardCapture(keyboard, toggleTrackpad) : (_e: ui.KeyEvent) => {};
function Screen(x: i32, y: i32, w: i32, h: i32): void {
  session.view(x, y, w, h);
  if (offline === null && trackpad()) touchOverlay.draw(x, y, w, h);
}
function App(): i32 {
  return <View className="flex-col h-full bg-slate-950" onKeyDown={handleKey}>
    <View className="flex-row items-center px-4 h-16 gap-2 bg-slate-900">
      <Text className="text-xl text-amber-200">{offline !== null ? 'ZINC / OFFLINE MEDIA' : 'ZINC / CARPLAY'}</Text>
      <View className="grow"></View>
      {offline === null ? <Button className="px-3 py-3 rounded bg-slate-700" onClick={() => keyboard.set(!keyboard.active)}><Text className="text-amber-200">{captured() ? 'F6 · Clavier CarPlay' : 'F6 · Clavier Zinc'}</Text></Button> : null}
      {offline === null ? <Button className="px-3 py-3 rounded bg-cyan-900" onClick={() => { const on = !inspector(); setInspector(on); keyboard.set(!on); if (on) { session.pollIap2(); session.traceIap2(true); } }}><Text className="text-cyan-100">{inspector() ? 'Vidéo' : 'iAP2'}</Text></Button> : null}
      {offline === null ? <Button className="px-3 py-3 rounded bg-slate-800" onClick={() => setHudShown(!hudShown())}><Text className="text-white">HUD</Text></Button> : null}
      {offline === null ? <Button className="px-3 py-3 rounded bg-slate-800" onClick={() => setDashboard(!dashboard())}><Text className="text-white">{dashboard() ? 'Vidéo' : 'Tableau de bord'}</Text></Button> : null}
      {offline === null ? <Button className="px-4 py-3 rounded bg-slate-800" onClick={() => setDebug(!debug())}><Text className="text-white">Debug</Text></Button> : null}
      {offline === null ? <Button className="px-4 py-3 rounded bg-slate-800" onClick={() => { const on = !devices(); setDevices(on); if (on) keyboard.set(false); }}><Text className="text-white">{devices() ? 'Vidéo' : 'Appareils'}</Text></Button> : null}
      {offline === null ? <Button className="px-5 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={connect}><Text className="text-white">Connect</Text></Button> : <Text className="text-slate-400">Local H.264 + PCM test media</Text>}
      {offline === null ? <Button className="px-5 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { session.close(); }}><Text className="text-white">Disconnect</Text></Button> : null}
    </View>
    {devices() ? <DevicesPanel /> : inspector() ? <Iap2Panel /> : dashboard() ? <VehicleDashboard nightMode={night()} /> : <View className="flex-row grow h-0">
      <View className="grow flex-col w-0">
        <Canvas className="grow h-0" onDraw={Screen} onPointerDown={() => { keyboard.set(true); }}></Canvas>
        {offline === null && hudShown() ? <HudPanel /> : null}
      </View>
      {debug() ? <DebugPanel /> : null}
    </View>}
    <View className="flex-row items-center h-20 px-6 gap-4 bg-slate-900">
      {offline === null ? <View className="flex-row gap-4"><Button className="px-6 py-3 rounded bg-amber-200 active:bg-amber-400" onClick={() => { session.home(); }}><Text className="text-slate-950">Home</Text></Button>
      <Button className="px-6 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { session.siri(); }}><Text className="text-white">Siri</Text></Button>
      <Button className="px-6 py-3 rounded bg-slate-800 active:bg-slate-600" onClick={() => { const n = !night(); setNight(n); session.setNightMode(n); }}><Text className="text-white">{night() ? 'Night' : 'Day'}</Text></Button></View> : null}
      {offline === null ? <Button className="px-3 py-3 rounded bg-slate-700" onClick={toggleTrackpad}><Text className="text-amber-200">{trackpad() ? 'Trackpad ON · F7' : 'Trackpad OFF · F7'}</Text></Button> : null}
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
  const debugDt = elapsed;
  elapsed = 0;
  if (offline === null) { tickDebug(session, debugDt); tickHud(session); tickIap2(session, debugDt, inspector()); tickVehicle(session); tickDevices(session, debugDt, devices()); }
  if (offline === null && url !== '') setStatus(session.status);
  setDetail(session.error !== '' ? session.error : offline !== null ? `${session.width} × ${session.height} / ${session.frames} packets / Local four-second loop · 440 Hz tone` : `${session.width} × ${session.height} / ${session.frames} packets / Arrows · Tab · Enter · Esc · Home · S / F6: keyboard capture`);
});
