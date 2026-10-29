// zinc:audio's Music on the null backend, where mix() pulls the mixer: a file given in MUSIC_FILE (a 2 s tone at 440 Hz) opens in the
// background, plays as it is read, pauses, seeks and ends. Prints what the test compares. A position counts the frames the mixer took,
// which runs up to a block (about 10 ms) ahead of what mix() gave back.
import { openMusic, mix } from 'zinc:audio';
import * as sys from 'zinc:sys';

function peak(s: number[]): number { let p = 0; for (const v of s) p = Math.max(p, Math.abs(v)); return p; }
const r2 = (x: number): string => (Math.round(x * 100) / 100).toFixed(2);
function wait(ms: i32): Promise<void> { return new Promise<void>((done: () => void) => { setTimeout(done, ms); }); }

async function main(): Promise<void> {
  const m = openMusic(sys.env('MUSIC_FILE'));
  for (let i = 0; i < 100 && !m.ready && m.error === ''; i++) await wait(10);
  console.log(`ready ${m.ready} duration ${r2(m.duration)} error '${m.error}'`);
  m.play();
  await wait(100);   // the reader fills its ring
  const a = mix(24000);
  const at = m.position;   // under 0.5 when the reader was still filling its ring (a cold disk): silence, not a wait
  console.log(`played: sound ${peak(a) > 0.1} position ${at > 0.2 && at <= 0.52} playing ${m.playing}`);
  m.pause();
  console.log(`paused: silent ${peak(mix(4800)) === 0} position kept ${m.position === at} playing ${m.playing}`);
  m.seek(1.5);
  m.play();
  await wait(100);
  console.log(`seek: sound ${peak(mix(4800)) > 0.1} position ${m.position >= 1.5 && m.position <= 1.62}`);
  mix(48000);
  console.log(`end: ended ${m.ended} playing ${m.playing} position ${r2(m.position)}`);
  m.play();
  await wait(100);
  mix(4800);
  console.log(`again: position ${m.position <= 0.12} playing ${m.playing}`);
  m.close();
  const bad = openMusic('/no/such/file.m4a');
  for (let i = 0; i < 100 && bad.error === ''; i++) await wait(10);
  console.log(`missing: ready ${bad.ready} error ${bad.error !== ''}`);
}
main();
