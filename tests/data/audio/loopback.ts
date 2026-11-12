// Only the prepared snd-aloop harness may run this fixture: it deliberately uses real output.
import { backend, tone, stopAll } from 'zinc:audio';
import { exit } from 'zinc:sys';

if (backend().toLowerCase() !== 'alsa') {
  console.log('audio loopback requires ALSA');
  exit(1);
}
const first = tone(997, 0.6);
const second = tone(1499, 0.6);
if (!first.ok || !second.ok) exit(1);
first.volume = 0.25;
second.volume = 0.25;
first.play();
setTimeout(() => { second.play(); }, 750);
setTimeout(() => {
  stopAll();
  first.unload();
  second.unload();
  console.log('audio loopback fixture ok');
  exit(0);
}, 1500);
