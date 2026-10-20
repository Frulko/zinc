// What zinc:audio answers the same way on every backend that plays nothing (ZN-390): the plugin's null backend
// (audio.host.cpp without a device) and the Zinc stand-in of a deterministic run (audio.sim.ts).
import { tone, load, decode, mix, backend, SAMPLE_RATE, setVolume, volume, stopAll } from 'zinc:audio';

const t = tone(880, 0.1);
console.log(`backend ${backend()} rate ${SAMPLE_RATE}`);
console.log(`tone: ok ${t.ok} ${t.duration} s playing ${t.playing}`);
t.play();
console.log(`played: ${t.playing}`);
t.stop();
console.log(`stopped: ${t.playing}`);
t.loop = true;
t.volume = 0.5;
t.play();
stopAll();
console.log(`stopAll: ${t.playing} loop ${t.loop} volume ${t.volume}`);
setVolume(0.25);
console.log(`master ${volume()}, silence ${mix(2).join(' ')}`);
const m = load('missing.wav');
m.play();
console.log(`missing: ok ${m.ok} playing ${m.playing} (${m.error})`);
console.log(`empty: ok ${decode([]).ok}`);
t.unload();
t.play();
console.log(`unloaded: ok ${t.ok} playing ${t.playing}`);
