import C from '../../../plugins/carplay/native/carplay.spec';
import M from '../../../plugins/microphone/native/microphone.spec';
import { MicrophoneUplink } from '../../../plugins/carplay/microphone';
import { serveWebSocket, WebSocket, MessageEvent } from 'zinc:socket';
import * as sys from 'zinc:sys';

function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
function delay(): Promise<void> { return new Promise<void>(resolve => { setTimeout(resolve, 25); }); }

check(C.micOpen(2, 16000, 1, 320, 0) === -1, 'unknown codec rejected');
check(C.micOpen(0, 16000, 0, 320, 0) === -1, 'invalid channels rejected');
check(C.micOpen(1, 48000, 1, 480, 32000) === -1, 'non-20ms Opus rejected');
check(C.micOpen(1, 44100, 1, 882, 32000) === -1, 'unsupported Opus rate rejected');
const pcm = C.micOpen(0, 16000, 1, 6, 0);
check(pcm >= 0, 'PCM encoder');
const bytes = C.micEncode(pcm, [-1, -0.5, 0, 0.5, 1, 2]);
check(bytes.join(',') === '16,1,128,1,192,0,0,0,64,255,127,255,127', 'exact PlayPort little-endian PCM16 envelope');
check(C.micEncode(pcm, [0]).length === 0, 'partial packet rejected');
check(C.micEncode(pcm, [NaN, 0, 0, 0, 0, 0]).length === 0, 'NaN rejected');
C.micClose(pcm); C.micClose(pcm);
check(C.micEncode(pcm, [0, 0, 0, 0, 0, 0]).length === 0, 'closed encoder rejected');
for (const rate of [8000, 12000, 16000, 24000, 48000]) for (const channels of [1, 2]) {
  const encoder = C.micOpen(1, rate, channels, rate / 50, 32000);
  check(encoder >= 0, 'Opus encoder at requested rate');
  const samples: number[] = [];
  for (let i = 0; i < rate / 50 * channels; i++) samples.push(Math.sin(i * 0.1) * 0.5);
  const decoder = C.audioOpen(2, 48000, channels, []);
  check(decoder >= 4, 'Opus validation decoder');
  for (let i = 0; i < 3; i++) {
    const packet = C.micEncode(encoder, samples);
    check(packet[0] === 0x11 && packet.length > 1, 'raw Opus WebSocket envelope');
    const decoded = C.audioDecode(decoder, packet.slice(1));
    check(decoded.length === 960 * channels || (i === 0 && decoded.length === 936 * channels), '20ms Opus, allowing initial decoder delay');
    check(decoded.some((n: number) => Math.abs(n) > 0.001), 'encoded samples are audible');
  }
  C.close(decoder); C.micClose(encoder);
}
const handles: i32[] = [];
for (let i = 0; i < 4; i++) handles.push(C.micOpen(0, 16000, 1, 320, 0));
check(C.micOpen(0, 16000, 1, 320, 0) === -1, 'bounded encoder handles');
for (const h of handles) C.micClose(h);

async function capture(): Promise<void> {
  let peer: WebSocket | null = null;
  const received: u8[][] = [];
  const errors: string[] = [];
  const server = await serveWebSocket(0, (ws: WebSocket) => {
    peer = ws;
    ws.onmessage = (e: MessageEvent) => { if (e.binary) received.push(e.bytes); };
  }, '127.0.0.1');
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const mic = new MicrophoneUplink((b: u8[]) => { socket.sendBytes(b); }, (s: string) => { errors.push(s); });
  try {
    for (let i = 0; i < 100 && peer === null; i++) await delay();
    check(peer !== null, 'loopback WebSocket connected');
    mic.start('bad', 16000, 1, 320, 0);
    check(errors.length === 1, 'invalid request reported'); errors.length = 0;
    for (let cycle = 0; cycle < 6; cycle++) {
      received.length = 0;
      const opus = cycle % 2 === 1;
      const packetSamples = opus ? 960 : cycle === 2 ? 640 : 160;
      mic.start(opus ? 'opus' : 'lpcm', opus ? 48000 : 16000, 1, packetSamples, 32000);
      for (let i = 0; i < 100 && received.length < 2 && errors.length === 0; i++) await delay();
      check(errors.length === 0, 'fake capture opens and encodes');
      check(received.length >= 2 && received[0][0] === (opus ? 0x11 : 0x10), 'fake capture reaches backend WebSocket');
      if (!opus) {
        check(received[0].length === 1 + packetSamples * 2, 'PCM capture split/assembled exactly');
        const fake = M.open('zinc:fake-microphone', 16000, 1);
        const reference = C.micOpen(0, 16000, 1, packetSamples, 0);
        let samples = M.read(fake);
        if (samples.length < packetSamples) samples = samples.concat(M.read(fake));
        const expected = C.micEncode(reference, samples.slice(0, packetSamples));
        check(received[0].join(',') === expected.join(','), 'captured PCM samples preserved');
        C.micClose(reference); M.close(fake);
      }
      mic.stop(); mic.stop();
      await delay(); await delay();
      const count = received.length;
      await delay(); await delay();
      check(received.length === count, 'no uplink after stop');
    }
    // Stop before the first capture callback, then restart without leaking a slot.
    mic.start('lpcm', 16000, 1, 320, 0); mic.stop();
    mic.start('lpcm', 16000, 1, 320, 0); mic.stop();
    const broken = new MicrophoneUplink((b: u8[]) => { throw new Error('closed socket'); }, (s: string) => { errors.push(s); });
    broken.start('lpcm', 16000, 1, 320, 0);
    for (let i = 0; i < 100 && errors.length === 0; i++) await delay();
    check(errors.length === 1 && errors[0] === 'Microphone transport send failed', 'send failure releases capture');
    broken.stop();
  } finally {
    mic.stop(); socket.close();
    const p = peer; if (p !== null) p.close();
    server.close();
  }
  console.log('carplay microphone: PCM, Opus, capture, WebSocket, cleanup ok');
}
capture().catch((e: Error) => { console.error(e.message); sys.exit(1); });
