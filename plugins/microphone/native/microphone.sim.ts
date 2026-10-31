// zinc:microphone without native code (ZINC_NATIVE=sim, --target sim, a machine that cannot build the plugin): the fake microphone of
// microphone.host.cpp alone, the same samples (sample() below is its sample(): integers and one rounding to float).
import * as sys from 'zinc:sys';

const FAKE = 'zinc:fake-microphone\u001fZinc Fake Microphone\u001e';

class Mic {
  rate: i32; ch: i32; n: i32 = 0; lvl: number = 0;
  constructor(rate: i32, ch: i32) { this.rate = rate; this.ch = ch; }
}
const mics: (Mic | null)[] = [];
let err = '';
const noFake = (): boolean => sys.env('ZINC_FAKE_MICROPHONE') === '0';
const at = (h: i32): Mic | null => h >= 0 && h < mics.length ? mics[h] : null;

function sample(n: i32, rate: i32): number {
  const block = Math.trunc(n / Math.trunc(rate / 50));
  const t = n % 100, tri = t < 50 ? t : 100 - t;
  const x = (Math.imul(n, 1103515245) + 12345) >>> 0;
  const noise = ((x >>> 16) & 0x7fff) / 32768 - 0.5;
  return Math.fround((block % 10 + 1) / 20 * (tri / 25 - 1) + noise * 0.02);
}

export default {
  permission: (_ask: boolean): i32 => 1,
  devices: (): string => { err = ''; return noFake() ? '' : FAKE; },
  error: (): string => err,
  open: (id: string, rate: i32, ch: i32): i32 => {
    err = '';
    if (noFake() || (id !== '' && id !== 'zinc:fake-microphone')) {
      err = noFake() ? 'microphone: no microphone on this machine' : `microphone: no microphone '${id}' (only the fake microphone 'zinc:fake-microphone' without native code)`;
      return -1;
    }
    mics.push(new Mic(rate <= 0 ? 48000 : rate < 8000 ? 8000 : rate > 192000 ? 192000 : rate, ch <= 0 ? 1 : ch > 2 ? 2 : ch));
    return mics.length - 1;
  },
  format: (h: i32): number[] => { const m = at(h); return m === null ? [0, 0, 0] : [m.rate, m.ch, 20]; },
  read: (h: i32): number[] => {
    const m = at(h);
    if (m === null) return [];
    const out: number[] = [];
    let sum = 0;
    for (let f = 0; f < Math.trunc(m.rate / 50); f++, m.n++) {
      const s = sample(m.n, m.rate);
      for (let c = 0; c < m.ch; c++) { out.push(s); sum += s * s; }
    }
    m.lvl = Math.min(1, Math.sqrt(sum / out.length));
    return out;
  },
  processing: (_h: i32, _what: i32): void => {},   // ponytail: no voice processing without native code (SpeexDSP is C)
  reference: (_h: i32, _s: number[], _rate: i32): void => {},
  level: (h: i32): number => { const m = at(h); return m === null ? 0 : m.lvl; },
  close: (h: i32): void => { if (at(h) !== null) mics[h] = null; },
};
