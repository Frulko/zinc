// NAT-13 esp32 subset of modules.ts: storage (NVS), fs (SPIFFS), gpio.simulate, events.
// net/osc loopback are skipped here: QEMU has no WiFi radio and no host-reachable UDP/TCP.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as storage from 'zinc:storage';
import * as gpio from 'zinc:gpio';
import { Emitter } from 'zinc:events';

console.log('platform ok', sys.platform().length > 0, sys.env('ZINC_UNSET_VAR') === '');
const dir = 'build/modtest_esp32';
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
