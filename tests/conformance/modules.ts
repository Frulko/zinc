// NAT-13: built-in native modules, identical on sim and native
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as storage from 'zinc:storage';
import { send, listen, close, OscMessage } from 'zinc:osc';
import { serve, stop, fetch, Request, Reply } from 'zinc:net';
import * as gpio from 'zinc:gpio';
import { Emitter } from 'zinc:events';
import { MqttClient } from 'zinc:mqtt';

console.log('platform ok', sys.platform().length > 0, sys.env('ZINC_UNSET_VAR') === '');
const dir = 'build/modtest';
fs.mkdir('build');
fs.mkdir(dir);
fs.writeText(`${dir}/a.txt`, 'hello');
fs.appendText(`${dir}/a.txt`, ' world');
fs.writeText(`${dir}/b.txt`, 'b');
console.log(fs.readText(`${dir}/a.txt`), fs.exists(`${dir}/b.txt`), fs.list(dir));
try { fs.readText(`${dir}/missing.txt`); } catch (e) { console.log('caught', e.message); }
fs.remove(`${dir}/b.txt`);
console.log(fs.list(dir));

storage.set('lang', 'fr');
storage.set('multi', 'a\tb\nc');
console.log(storage.get('lang'), storage.get('multi').length, storage.get('nope') === '');
storage.remove('lang');

const bus = new Emitter<string>();
bus.on((s: string) => { console.log('event', s); });
bus.emit('one');
bus.emit('two');

gpio.setup(27, 'in', 'up');
gpio.setup(17, 'out', 'none');
gpio.watch(27, 'falling', 0, (e: gpio.PinEdge) => { gpio.write(17, 1); console.log('edge', e.pin, e.value, gpio.read(17)); });
gpio.simulate(27, 0);

async function main(): Promise<void> {
  // OSC loopback
  const got = new Promise<string>(resolve => {
    listen(9127, (m: OscMessage) => { resolve(`${m.address} ${m.numbers} ${m.strings}`); });
  });
  send('127.0.0.1', 9127, '/scene/brightness', [0.5, 3], ['on']);
  console.log('osc', await got);
  close();
  // HTTP server + fetch to itself
  serve(9128, (req: Request): Reply => ({ status: 200, body: `you asked ${req.method} ${req.path} ${req.body}`, contentType: 'text/plain' }));
  const res = await fetch('http://127.0.0.1:9128/ping?x=1', { method: 'POST', body: 'hi', contentType: 'text/plain' });
  console.log('http', res.status, res.ok, await res.text());
  stop();
  // MQTT without a broker: the error path
  const client = new MqttClient('127.0.0.1', 1, 'zinc-test');
  try { await client.connect(); } catch (e) { console.log('mqtt', e.message); }
}
main();
