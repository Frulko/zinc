// sidecar-screen: a screen with a network (a Raspberry Pi on HDMI, display-fbdev) as a Mac's display, in colour. The driver listens for
// the Mac and draws its screen itself (display-rmpp/stream.h, the reMarkable's protocol); this page only says where to connect and shows
// again when the Mac leaves. The Mac's side: app/sidecar/mac (sidecar-screen --host <this machine>).
import { render, createSignal } from 'zinc:ui/solid';
import { device, env } from 'zinc:sys';
import { readStatus } from 'zinc:network';
import { hostname } from 'zinc:os';
import { listen, Socket } from 'zinc:socket';
import { stream, AudioStream } from 'zinc:audio';

const PORT = env('ZINC_SIDECAR_PORT') !== '' ? parseInt(env('ZINC_SIDECAR_PORT')) : 7710;

// The Mac's sound, on the next port: this screen first says "OK" when it has a sound output (else "NO <why>"), so the Mac offers the
// option; the Mac then sends "PCM <rate> <channels>" and its samples as they come, 16-bit little-endian, interleaved, played through the
// default output (a Pi's jack, or HDMI when the screen has speakers). zinc:audio's stream holds 60 ms against the network's jitter; a
// stream that runs ahead (the Mac's clock against the Pi's) loses a packet, so the sound stays with the picture.
const probe = stream(2, 48000);
const SOUND = probe.ok;
probe.close();
listen(PORT + 1, (s: Socket) => {
  s.write(SOUND ? 'OK\n' : 'NO this screen has no sound output\n');
  let line = '', sp: AudioStream | null = null, ch = 2;
  const part: u8[] = [0, 0, 0, 0];
  let np = 0;
  const v: number[] = [];
  let skipped = 0;
  s.onBytes((b: u8[]) => {
    let i = 0;
    if (sp === null) {
      while (i < b.length && b[i] !== 10) line += String.fromCharCode(b[i++]);
      if (i === b.length) return;
      i++;
      const w = line.split(' ');
      ch = w.length === 3 && w[2] === '1' ? 1 : 2;
      if (w[0] !== 'PCM' || !SOUND) { s.close(); return; }
      sp = stream(ch, parseInt(w[1]));
      console.log(`sound: ${w[1]} Hz, ${ch} channel(s) from ${s.remoteAddress}`);
    }
    const out = sp as AudioStream;
    const ahead = out.buffered > 0.1;   // ahead of the output: this packet goes (~10 ms), its bytes still counted so frames stay whole
    if (ahead) skipped++;
    // whole frames into one array kept from packet to packet (no garbage at 96,000 samples a second); a frame cut between two packets
    // waits in `part`
    v.length = 0;
    for (; i < b.length; i++) {
      part[np++] = b[i];
      if (np < 2 * ch) continue;
      np = 0;
      if (ahead) continue;
      for (let c = 0; c < ch; c++) { const x = part[2 * c] | (part[2 * c + 1] << 8); v.push((x >= 32768 ? x - 65536 : x) / 32768); }
    }
    if (v.length > 0) out.write(v);
  });
  s.onClose(() => {
    if (sp === null) return;
    const o = sp as AudioStream;
    console.log(`sound: ended, ${o.underruns} time(s) dry, ${o.dropped} frames dropped by the stream, ${skipped} packets skipped ahead`);
    o.close();
  });
});
const [state, setState] = createSignal<string>('starting');
const [where, setWhere] = createSignal<string>('');
// <hostname>.local answers on any link, a cable straight to the Mac too (link-local, image/files/etc/NetworkManager)
const NAME = hostname() + '.local';
// the driver listens once its screen is up, after the first frame: asked again each second, given up on after five
let tries = 0;
setInterval(() => {
  let s = device('stream.state');
  if (s === 'off' || s === '') s = device('stream.listen', `${PORT}`) === '1' ? 'waiting' : ++tries >= 5 ? 'failed' : 'starting';
  if (s !== state()) setState(s);
}, 1000);
async function lookUp(): Promise<void> {
  const st = await readStatus();
  const found: string[] = [];
  for (const nic of st.interfaces) if (nic.address !== '') found.push(nic.address.split('/')[0]);
  setWhere(found.join(', '));
}
lookUp();
setInterval(() => { lookUp(); }, 10000);

function App(): i32 {
  return <View className="flex-col grow items-center justify-center gap-8 px-16">
    <Text className="text-[56px] font-bold text-white">{state() === 'failed' ? 'Sidecar cannot start' : 'Waiting for the Mac'}</Text>
    <Text className="text-[30px] text-gray-300 text-center">{state() !== 'failed'
      ? `In Zinc Sidecar on the Mac: Add a screen, address ${NAME} (port ${PORT}).`
      : `Port ${PORT} is taken, or this screen cannot be shared (see the app's log).`}</Text>
    <Text className="text-[24px] text-gray-500">{where() !== '' ? `Or by its address: ${where()}` : 'Looking for this screen\'s address…'}</Text>
  </View>;
}

render(() => <App />, 0x0a0a0a, null);
