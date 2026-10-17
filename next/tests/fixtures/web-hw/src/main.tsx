// The browser-API plugins of the web target (zinc:serial, zinc:midi, zinc:osc, zinc:gphoto2), against the mocks of ../mocks.js. Each section writes one line; a failure writes its message.
import { render, createSignal, For } from 'zinc:ui/solid';
import * as serial from 'zinc:serial';
import * as midi from 'zinc:midi';
import * as osc from 'zinc:osc/full';
import * as cam from 'zinc:gphoto2';

const [lines, setLines] = createSignal<string[]>([]);
const say = (s: string): void => setLines([...lines(), s]);
const sleep = (ms: number): Promise<void> => new Promise((r: any) => setTimeout(r, ms));

async function run(): Promise<void> {
  try {
    serial.list(); await sleep(100);
    const ports = serial.list();
    const p = serial.open(ports[0], 115200, '8N2');
    const got: string[] = [];
    p.onLine((l: string) => got.push(l));
    p.write('hello\n'); p.setSignals(true, false);
    await sleep(300);
    say(`serial: ${ports.length} port ${ports[0]}, echo ${got.join('|')}, open ${p.isOpen}`);
    p.close();
  } catch (e) { say('serial failed: ' + String(e)); }
  try {
    midi.inputs(); await sleep(100);
    const ins = midi.inputs(), outs = midi.outputs();
    const inp = midi.openInput(), out = midi.openOutput();
    const notes: string[] = [];
    inp.onNote((n: number, v: number, c: number) => notes.push(`${n}/${v}/${c}`));
    out.noteOn(60, 100, 2); out.noteOff(60, 2);
    await sleep(100);
    say(`midi: in ${ins.join()}, out ${outs.join()}, notes ${notes.join(' ')}`);
    let virtual = 'no error';
    try { midi.createInput('x'); } catch (e) { virtual = String(e); }
    say('midi virtual: ' + virtual);
  } catch (e) { say('midi failed: ' + String(e)); }
  try {
    const o = await osc.open(0, 'ws://mock/osc');
    let value = -1, addr = '';
    o.on('/fader/*', (m: any) => { value = m.args[0].num; addr = m.address; });
    o.send('', 0, new osc.Message('/fader/1').float(0.5));
    await sleep(100);
    say(`osc: ${addr} ${value}`);
    let why = 'no error';
    try { await osc.open(0, ''); } catch (e) { why = e.name; }
    say('osc udp: ' + why);
  } catch (e) { say('osc failed: ' + String(e)); }
  try {
    const cams = await cam.detect();
    const model = await cam.open(cams[0].model, cams[0].port);
    const sum = await cam.summary();
    const cfg = await cam.config();
    const iso = cfg.find((w: any) => w.name === 'iso');
    await cam.set('iso', '800');
    const file = await cam.capture('x');
    say(`gphoto2: ${cams.length} camera, ${model}, ${sum.split('\n').length} summary lines, ${cfg.length} settings, iso ${iso ? iso.value + ' of ' + iso.choices.join('/') : 'none'}, picture ${file.startsWith('blob:') ? 'downloaded' : file}`);
    await cam.close();
  } catch (e) { say('gphoto2 failed: ' + String(e)); }
  say('done');
}

function App(): i32 {
  return <View className="p-6 flex-col gap-2 bg-white w-full h-full">
    <Button className="bg-sky-600 rounded-md px-3 py-2 cursor-pointer" onClick={run}><Text className="text-white">Run</Text></Button>
    <For each={lines()}>{(l: string) => <Text>{l}</Text>}</For>
  </View>;
}

render(App, 0xffffff, null);
