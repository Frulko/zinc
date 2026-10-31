// zinc:microphone's voice processing through the plugin (tests/t1/microphone_voice.sh): the fake microphone opened four times, unprocessed,
// with echo cancellation and its own samples as the reference (as if all it heard were the speakers), with echo cancellation and no
// reference, and with noise suppression and gain control. Prints, over 2 s after 3 s of convergence, whether the canceller took the "echo"
// away (10 dB or more: the fake microphone's tone is a hard signal for it, tests/t0/voice_aec.sh measures it on a recorded voice), left
// the sound alone without a reference, and whether the other two changed it.
import { Microphone } from 'zinc:microphone';

// the fake microphone's sample n at 48 kHz (plugins/microphone/native/microphone.sim.ts)
function sample(n: i32): number {
  const block = Math.trunc(n / 960);
  const t = n % 100, tri = t < 50 ? t : 100 - t;
  const x = (Math.imul(n, 1103515245) + 12345) >>> 0;
  const noise = ((x >>> 16) & 0x7fff) / 32768 - 0.5;
  return Math.fround((block % 10 + 1) / 20 * (tri / 25 - 1) + noise * 0.02);
}

async function main(): Promise<void> {
  let next = 0;
  const played = (): number[] => { const out: number[] = []; for (let i = 0; i < 960; i++) out.push(sample(next++)); return out; };
  const mics = [
    await Microphone.open('', {}),
    await Microphone.open('', { echoCancellation: true, reference: played }),
    await Microphone.open('', { echoCancellation: true }),
    await Microphone.open('', { noiseSuppression: true, autoGainControl: true }),
  ];
  const energy: number[] = [0, 0, 0, 0];
  let blocks = 0;
  await new Promise<void>((done: () => void) => {
    for (let i = 0; i < mics.length; i++) mics[i].onData((s: number[], first: number) => {
      if (first >= 48000 * 3 && first < 48000 * 5) for (const v of s) energy[i] += v * v;
      if (i === 0 && ++blocks === 260) done();
    });
  });
  const db = (i: number): number => 10 * Math.log10(energy[0] / Math.max(energy[i], 1e-12));
  console.log(`echo cancelled: ${db(1) >= 10}; untouched without a reference: ${Math.abs(db(2)) < 3}; noise and gain applied: ${Math.abs(db(3)) > 1}`);
  console.error(`quieter by: echo ${db(1).toFixed(1)} dB, no reference ${db(2).toFixed(1)} dB, noise and gain ${db(3).toFixed(1)} dB`);
  mics[1].setProcessing({});
  for (const m of mics) m.close();
}
main();
