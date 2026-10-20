// zinc:microphone against the fake microphone (tests/t1/microphone.sh): the list, a microphone opened at 16 kHz, blocks with their first
// frame index and a hash of their samples (the same on every machine and engine: the samples are a function of the frame index), the level,
// close, an unknown id; then navigator.mediaDevices: enumerateDevices and getUserMedia({ audio }).
import { devices, requestPermission, Microphone } from 'zinc:microphone';
import { navigator, MediaDeviceInfo, DOMException } from 'zinc:web';

function hash(b: number[]): string {
  let h = 2166136261;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ Math.round(b[i] * 32767), 16777619) >>> 0;
  return '' + h;
}

async function main(): Promise<void> {
  console.log('permission ' + (await requestPermission()));
  const list = await devices();
  for (const d of list) console.log('device ' + d.id + ' | ' + d.name);
  const mic = await Microphone.open(list[0].id, { sampleRate: 16000, channels: 1 });
  console.log(`open ${mic.sampleRate} Hz ${mic.channels} ch, level ${mic.level()}`);
  const seen: string[] = [];
  await new Promise<void>((done: () => void) => {
    mic.onData((s: number[], first: number) => {
      seen.push(first + ':' + s.length);
      if (seen.length === 3) console.log(`block 3 ${hash(s)} level ${mic.level().toFixed(4)}`);
      if (seen.length === 12) { console.log(`block 12 ${hash(s)} level ${mic.level().toFixed(4)}`); done(); }
    });
  });
  console.log('blocks ' + seen.join(','));
  mic.close();
  console.log(`closed ${mic.isOpen} ${mic.level()}`);
  const stereo = await Microphone.open('', { sampleRate: 8000, channels: 2 });
  await new Promise<void>((done: () => void) => {
    stereo.onData((s: number[], first: number) => { console.log(`stereo ${first} ${s.length} ${s[0] === s[1]} ${hash(s)}`); stereo.close(); done(); });
  });
  try { await Microphone.open('no-such-microphone'); } catch (e) { console.log('error ' + (e as Error).message.split(' (')[0]); }
  const all = await navigator.mediaDevices.enumerateDevices();
  console.log('enumerate ' + all.map((d: MediaDeviceInfo) => d.kind + ':' + d.label).join(','));
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000 } });
  const t = stream.getAudioTracks()[0];
  const st = t.getSettings();
  console.log(`stream ${stream.active} ${t.kind} ${t.label} ${st.sampleRate} ${st.channelCount} video ${stream.getVideoTracks().length} image ${t.image}`);
  const m = t.microphone as Microphone;
  await new Promise<void>((done: () => void) => { m.onData((s: number[], first: number) => { console.log(`track ${first} ${hash(s)}`); done(); }); });
  t.stop();
  console.log(`stopped ${stream.active} ${t.readyState} ${m.isOpen}`);
  try { await navigator.mediaDevices.getUserMedia({ audio: { deviceId: 'nope' } }); } catch (e) { console.log('deviceId ' + (e as DOMException).name); }
}
main();
