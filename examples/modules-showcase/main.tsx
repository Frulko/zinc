// Every built-in native module, live on one screen (Solid model). Each card talks to the real module:
// the HTTP server and client, OSC sender and listener talk to themselves over loopback.
import { createSignal, render } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as storage from 'zinc:storage';
import * as net from 'zinc:net';
import * as osc from 'zinc:osc';
import { MqttClient } from 'zinc:mqtt';
import * as telemetry from 'zinc:telemetry';
import * as gpio from 'zinc:gpio';
import { Emitter } from 'zinc:events';
import * as assets from 'zinc:assets';

const T0 = sys.clock();
const HTTP_PORT: i32 = 8787, OSC_PORT: i32 = 9031, LED: u8 = 17, BUTTON: u8 = 27;

// sys
const [uptime, setUptime] = createSignal<string>('0.0 s');
const [objects, setObjects] = createSignal<i32>(0);
// storage: survives restarts
const launches = parseInt(storage.get('launches') === '' ? '0' : storage.get('launches')) + 1;
storage.set('launches', `${launches}`);
// fs
const DIR = 'showcase-data';
fs.mkdir(DIR);
const [files, setFiles] = createSignal<string>('');
function writeNote(): void {
  fs.appendText(`${DIR}/notes.txt`, `note at ${((sys.clock() - T0) / 1000).toFixed(1)} s\n`);
  const lines = fs.readText(`${DIR}/notes.txt`).split('\n').length - 1;
  setFiles(`${fs.list(DIR).join(', ')} · ${lines} line(s)`);
}
writeNote();
// net: a server, and a client polling it
let hits = 0;
net.serve(HTTP_PORT, (req: net.Request): net.Reply => {
  hits++;
  return { status: 200, body: `hello #${hits} from ${req.path}`, contentType: 'text/plain' };
});
const [http, setHttp] = createSignal<string>('…');
async function poll(): Promise<void> {
  try {
    const r = await net.fetch(`http://127.0.0.1:${HTTP_PORT}/ping`);
    setHttp(`${r.status} "${await r.text()}"`);
  } catch (e) {
    setHttp(`error: ${e.message}`);
  }
}
// osc loopback
const [oscLast, setOscLast] = createSignal<string>('waiting');
osc.listen(OSC_PORT, (m: osc.OscMessage) => { setOscLast(`${m.address} ${m.numbers.map((n: number) => n.toFixed(2)).join(' ')}`); });
// mqtt: needs a broker on localhost:1883 (e.g. mosquitto)
const [mqtt, setMqtt] = createSignal<string>('connecting to 127.0.0.1:1883…');
async function startMqtt(): Promise<void> {
  const c = new MqttClient('127.0.0.1', 1883, 'zinc-showcase');
  try {
    await c.connect();
    c.subscribe('zinc/showcase', (topic: string, payload: string) => { setMqtt(`${topic}: ${payload}`); });
    c.publish('zinc/showcase', `hello from ${sys.platform()}`);
  } catch (e) {
    setMqtt(`no broker (${e.message})`);
  }
}
startMqtt();
// gpio (simulated on desktops, real pins on Pi / ESP32)
const [led, setLed] = createSignal<boolean>(false);
gpio.setup(LED, 'out', 'none');
gpio.setup(BUTTON, 'in', 'up');
gpio.watch(BUTTON, 'falling', 20, (e: gpio.PinEdge) => {
  const on = !led();
  gpio.write(LED, on ? 1 : 0);
  setLed(on);
  bus.emit(`button → LED ${on ? 'on' : 'off'}`);
});
// events
const bus = new Emitter<string>();
const [log, setLog] = createSignal<string>('');
bus.on((s: string) => { setLog(s); telemetry.event('bus', s); });
// telemetry
telemetry.expose('uptime', () => (sys.clock() - T0) / 1000);

let acc = 0, tick = 0;
function onTick(dt: number): void {
  acc += dt;
  if (acc < 1) return;
  acc = 0; tick++;
  setUptime(`${((sys.clock() - T0) / 1000).toFixed(1)} s`);
  setObjects(sys.liveObjects());
  poll();
  osc.send('127.0.0.1', OSC_PORT, '/showcase/tick', [tick, Math.sin(tick)]);
  telemetry.gauge('tick', tick);
}

interface CardProps { title: string; module: string; children: () => i32 }
function Card(props: CardProps): i32 {
  return <view class="flex-col gap-1 p-3 rounded-xl bg-white shadow w-[372]">
    <view class="flex-row justify-between items-center">
      <text class="text-base font-bold text-slate-900">{props.title}</text>
      <text class="text-xs text-blue-600">{props.module}</text>
    </view>
    {props.children()}
  </view>;
}

function App(): i32 {
  return <view class="flex-col gap-3 p-4 h-full bg-slate-100">
    <text class="text-2xl font-bold text-slate-900">Native modules, live</text>
    <view class="flex-row flex-wrap gap-3">
      <Card title="System" module="zinc:sys"><text class="text-sm text-slate-600">{sys.platform()} · up {uptime()} · {objects()} live objects</text></Card>
      <Card title="Key/value store" module="zinc:storage"><text class="text-sm text-slate-600">launched {launches} time(s) — restart the app</text></Card>
      <Card title="Files" module="zinc:fs">
        <view class="flex-row gap-2 items-center">
          <button onClick={() => writeNote()}><text>append</text></button>
          <text class="text-sm text-slate-600">{files()}</text>
        </view>
      </Card>
      <Card title="HTTP server + client" module="zinc:net"><text class="text-sm text-slate-600">GET :{HTTP_PORT}/ping → {http()}</text></Card>
      <Card title="OSC loopback" module="zinc:osc"><text class="text-sm text-slate-600">{oscLast()}</text></Card>
      <Card title="MQTT" module="zinc:mqtt"><text class="text-sm text-slate-600">{mqtt()}</text></Card>
      <Card title="GPIO" module="zinc:gpio">
        <view class="flex-row gap-2 items-center">
          <button onClick={() => { gpio.simulate(BUTTON, 0); gpio.simulate(BUTTON, 1); }}><text>press pin {BUTTON}</text></button>
          <view class={led() ? 'w-4 h-4 rounded-full bg-emerald-500' : 'w-4 h-4 rounded-full bg-slate-300'}></view>
          <text class="text-sm text-slate-600">LED pin {LED}</text>
        </view>
      </Card>
      <Card title="Events + telemetry" module="zinc:events · zinc:telemetry"><text class="text-sm text-slate-600">{log() === '' ? 'press the GPIO button' : log()} · telemetry {telemetry.enabled() ? 'on' : 'off (ZINC_TELEMETRY)'}</text></Card>
      <Card title="Embedded assets" module="zinc:assets"><text class="text-sm text-slate-600">{assets.list().join(', ')}: {assets.readText('hello.txt').trim()}</text></Card>
    </view>
  </view>;
}

render(App, 0xf1f5f9, onTick);
