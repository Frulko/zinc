import { createSignal } from 'zinc:ui/solid';
import { Slider } from 'zinc:ui/kit';
import { Session } from 'zinc:carplay';
import * as dialog from 'zinc:system/dialog';
import * as fs from 'zinc:fs';

const [latitude, setLatitude] = createSignal<string>('48.8566');
const [longitude, setLongitude] = createSignal<string>('2.3522');
const [speed, setSpeed] = createSignal<string>('0');
const [seconds, setSeconds] = createSignal<number>(0);
const [message, setMessage] = createSignal<string>('GPS disabled — injected fixes are simulated');
const [hud, setHud] = createSignal<string>('No iAP2 guidance received');
const [contacts, setContacts] = createSignal<string>('Native contacts: 0 · peak 0');
const [twoContacts, setTwoContacts] = createSignal<boolean>(false);
const [logs, setLogs] = createSignal<string>('No iAP2 events received');
let live: Session | null = null;
let pollElapsed = 0;
const [duration, setDuration] = createSignal<number>(1);
export function tickDebug(session: Session, dt: number): void {
  live = session;
  setContacts(`Native contacts: ${session.nativeContactCount} · peak ${session.nativeContactPeak}`);
  pollElapsed += dt;
  if (pollElapsed >= 1) { pollElapsed = 0; session.pollDebug(); }
  const gps = session.gps;
  if (gps !== null) {
    setSeconds(gps.seconds); setDuration(Math.max(1, gps.duration));
    setMessage(gps.enabled ? `SIMULATED GPS · ${gps.subscribed ? 'iPhone subscribed' : 'waiting for subscription'} · ${gps.points} route points · ${gps.lat ?? 0}, ${gps.lon ?? 0}` : 'GPS disabled');
  }
  const data = session.hud;
  if (data !== null) setHud(`${data.stale ? 'STALE · ' : ''}${data.active ? data.road + ' · ' + data.distance + ' m' : 'No active route'}\n${data.instruction}\n${data.title} · ${data.artist}`);
  setLogs(session.debugLog.slice(-8).join('\n'));
}
function apply(): void {
  const s = live;
  if (latitude().trim() === '' || longitude().trim() === '' || speed().trim() === '') { setMessage('Latitude, longitude and speed are required'); return; }
  if (s === null || !s.debugGps(Number(latitude()), Number(longitude()), Number(speed()) / 3.6)) {
    setMessage('Invalid GPS values or disconnected receiver'); return;
  }
  setMessage('SIMULATED GPS enabled · waiting for iPhone location subscription');
}
function preset(lat: string, lon: string): void { setLatitude(lat); setLongitude(lon); apply(); }
async function load(): Promise<void> {
  try {
    const options = new dialog.OpenOptions();
    options.title = 'Load a GPX route'; options.filters = [new dialog.Filter('GPX route', ['gpx'])];
    const paths = await dialog.open(options);
    if (paths === null || paths.length === 0) return;
    const text = fs.readText(paths[0]);
    const s = live;
    if (s === null || !s.loadGpx(text)) { setMessage('GPX too large (1 MiB maximum) or disconnected'); return; }
    setSeconds(0);
    setMessage('GPX sent · simulated route · timeline in seconds');
  } catch (e) { setMessage('Could not load the GPX file'); }
}
function Cluster(x: i32, y: i32, w: i32, h: i32): void {
  const s = live; if (s !== null) s.secondary.view(x, y, w, h);
}
export function DebugPanel(): i32 {
  return <ScrollView className="w-80 h-full bg-slate-900 p-4">
    <View className="flex-col gap-3">
      <Text className="text-amber-200 text-lg">CarPlay laboratory</Text>
      <Text className="text-slate-400 text-xs">External GPS · simulated injection</Text>
      <Text className="text-slate-200 text-xs">Latitude / longitude</Text>
      <Input className="h-9 bg-slate-800 text-white rounded px-2" value={latitude()} onInput={setLatitude} inputMode="decimal" />
      <Input className="h-9 bg-slate-800 text-white rounded px-2" value={longitude()} onInput={setLongitude} inputMode="decimal" />
      <Text className="text-slate-200 text-xs">Speed (km/h)</Text>
      <Input className="h-9 bg-slate-800 text-white rounded px-2" value={speed()} onInput={setSpeed} inputMode="decimal" />
      <View className="flex-row gap-2">
        <Button className="bg-amber-200 rounded p-2" onClick={apply}><Text className="text-slate-950">Apply fix</Text></Button>
        <Button className="bg-slate-700 rounded p-2" onClick={() => { const s = live; if (s !== null) s.stopDebugGps(); setMessage('GPS disabled'); }}><Text className="text-white">Stop GPS</Text></Button>
      </View>
      <View className="flex-row gap-2">
        <Button className="bg-slate-800 rounded p-2" onClick={() => preset('48.8566', '2.3522')}><Text className="text-white">Paris</Text></Button>
        <Button className="bg-slate-800 rounded p-2" onClick={() => preset('45.7640', '4.8357')}><Text className="text-white">Lyon</Text></Button>
        <Button className="bg-slate-800 rounded p-2" onClick={() => preset('43.2965', '5.3698')}><Text className="text-white">Marseille</Text></Button>
      </View>
      <Button className="bg-slate-700 rounded p-2" onClick={() => { load(); }}><Text className="text-white">Load GPX</Text></Button>
      <Text className="text-slate-200 text-xs">{`Route timeline · ${Math.floor(seconds())} s`}</Text>
      <Slider value={seconds} min={0} max={duration()} step={1} onChange={(value: number) => { setSeconds(value); const s = live; if (s !== null) s.seekGps(value); }} />
      <View className="flex-row gap-2">
        <Button className="bg-slate-700 rounded p-2" onClick={() => { const s = live; if (s !== null) s.playGps(true); }}><Text className="text-white">Play</Text></Button>
        <Button className="bg-slate-700 rounded p-2" onClick={() => { const s = live; if (s !== null) s.playGps(false); }}><Text className="text-white">Pause</Text></Button>
      </View>
      <Text className="text-amber-200 text-xs">{message()}</Text>
      <Text className="text-slate-200">Secondary display · stream 111</Text>
      <Canvas className="h-28 bg-slate-950" onDraw={Cluster}></Canvas>
      <Button className="bg-slate-700 rounded p-2" onClick={() => { const s = live; if (s !== null) s.showCluster(); }}><Text className="text-white">Request cluster map</Text></Button>
      <Text className="text-slate-400 text-xs">Enable ZINC_CARPLAY_CLUSTER=1 before receiver startup; navigation must be active.</Text>
      <Text className="text-slate-200 text-xs">{contacts()}</Text>
      <Text className="text-amber-200">HUD · received iAP2</Text>
      <Text className="text-white text-xs">{hud()}</Text>
      <Text className="text-slate-400 text-xs">{logs()}</Text>
      <Button className="bg-slate-700 rounded p-2" onClick={() => {
        const on = !twoContacts(); setTwoContacts(on); const s = live;
        if (s !== null) { s.touches([]); s.simulateTwoContacts = on; }
      }}><Text className="text-white">{twoContacts() ? 'Simulated two-contact drag: ON' : 'Simulate two-contact drag'}</Text></Button>
      <Text className="text-slate-400 text-xs">F6 releases keyboard capture to edit GPS and navigate Zinc controls. F6 or a video click captures it for CarPlay again. Native touch forwards two contacts.</Text>
    </View>
  </ScrollView>;
}
