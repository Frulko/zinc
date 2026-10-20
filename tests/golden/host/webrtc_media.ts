// zinc:webrtc audio and video in one process, no network, no device (tests/t1/webrtc_media.sh): the fake camera and the fake microphone
// (ZINC_FAKE_CAMERA, ZINC_FAKE_MICROPHONE) sent from one peer connection to another over their host candidates. Checked with thresholds,
// since the codecs are lossy: the picture of the peer (PSNR of the colour bars against the local frame), its size and rate, a key frame on
// request (PLI), the tone of the microphone after Opus (its frequency by Goertzel, its level), a disabled track (black, silence),
// replaceTrack to another size, setParameters (scaleResolutionDownBy, maxBitrate), the stats, setCodecPreferences, an edited local SDP,
// removeTrack and directions with a new negotiation, closing. Prints only lines that are the same on every run and engine.
import { RTCPeerConnection, RTCTrackEvent, RTCStats, RTCPeerConnectionIceEvent, RTCIceCandidate, RTCRtpSender, RTCRtpReceiver, RTCRtpTransceiver,
         RTCRtpCodec, RTCRtpCapabilities, RTCRtpSendParameters, RemoteVideo, RemoteAudio, RTCSessionDescription } from 'zinc:webrtc';
import 'zinc:camera';
import 'zinc:microphone';
import { navigator, MediaStream, MediaStreamTrack, DOMException } from 'zinc:web';

// No timeout here: the test's `timeout` bounds the run (QuickJS runs the timers of a program that does not draw on a virtual clock).
function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => {
    const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 5);
  });
}
function link(a: RTCPeerConnection, b: RTCPeerConnection): void {
  a.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) b.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  b.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) a.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
}
async function negotiate(a: RTCPeerConnection, b: RTCPeerConnection): Promise<void> {
  const offer = await a.createOffer();
  await a.setLocalDescription(offer);
  await b.setRemoteDescription(offer);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer);
  await a.setRemoteDescription(answer);
}
function pick(all: Map<string, RTCStats>, type: string, kind: string): RTCStats {
  let found = new RTCStats('', '');
  all.forEach((s: RTCStats) => { if (s.type === type && (kind === '' || s.kind === kind)) found = s; });
  return found;
}
async function stat(pc: RTCPeerConnection, type: string, kind: string): Promise<RTCStats> { return pick(await pc.getStats(), type, kind); }
async function sent(s: RTCRtpSender, type: string): Promise<RTCStats> { return pick(await s.getStats(), type, ''); }
// PSNR of the colour bars (rows h/12 to 2h/3 of the fake camera, the same on every frame) of two RGBA frames of one size
function psnr(a: u8[], b: u8[], w: number, h: number): number {
  let se = 0, n = 0;
  for (let y = Math.floor(h / 12) + 4; y < Math.floor(h * 2 / 3) - 4; y++)
    for (let x = 4; x < w - 4; x++) {
      if (Math.floor(x * 8 / w) !== Math.floor((x - 4) * 8 / w) || Math.floor(x * 8 / w) !== Math.floor((x + 4) * 8 / w)) continue;   // not across a bar edge
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; se += d * d; n++; }
    }
  return n === 0 || se === 0 ? 99 : 10 * Math.log10(255 * 255 / (se / n));
}
function luma(a: u8[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 16) s += a[i] + a[i + 1] + a[i + 2];
  return a.length === 0 ? -1 : s / (a.length / 16) / 3;
}
// power of one frequency in samples at 48 kHz (Goertzel)
function power(s: number[], hz: number): number {
  const k = 2 * Math.cos(2 * Math.PI * hz / 48000);
  let p1 = 0, p2 = 0;
  for (const v of s) { const p0 = v + k * p1 - p2; p2 = p1; p1 = p0; }
  return (p1 * p1 + p2 * p2 - k * p1 * p2) / s.length;
}
const yes = (ok: boolean): string => ok ? 'ok' : 'NO';

async function main(): Promise<void> {
  const caps = RTCRtpSender.getCapabilities('video');
  const names: string[] = caps === null ? [] : caps.codecs.map((c: RTCRtpCodec) => c.mimeType);
  console.log(`capabilities: video has VP8 ${names.indexOf('video/VP8') >= 0}, audio ${(RTCRtpReceiver.getCapabilities('audio') as RTCRtpCapabilities).codecs.map((c: RTCRtpCodec) => c.mimeType).join(' ')}, other kind ${RTCRtpSender.getCapabilities('text') === null ? 'null' : 'codecs'}`);

  const local = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 30 }, audio: true });
  const cam = local.getVideoTracks()[0], mic = local.getAudioTracks()[0];
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  link(a, b);
  let needed = 0;
  a.onnegotiationneeded = () => { needed++; };
  const vs = a.addTrack(cam, local), as = a.addTrack(mic, local);
  try { a.addTrack(cam, local); } catch (e) { console.log('addTrack twice: ' + (e as DOMException).name); }
  console.log(`a senders ${a.getSenders().length} transceivers ${a.getTransceivers().map((t: RTCRtpTransceiver): string => t.receiver.track.kind + ':' + t.direction + ':' + (t.mid ?? 'null')).join(' ')}`);
  const got: MediaStreamTrack[] = [];
  let streamsOk = true;
  b.ontrack = (e: RTCTrackEvent) => { got.push(e.track); streamsOk = streamsOk && e.streams.length === 1 && e.streams[0].id === local.id && e.transceiver.receiver === e.receiver; };
  await until(() => needed > 0);
  console.log(`negotiationneeded ${needed}`);
  await negotiate(a, b);
  console.log(`ontrack ${got.map((t: MediaStreamTrack) => t.kind).join(' ')} streams ${yes(streamsOk)}; b transceivers ${b.getTransceivers().map((t: RTCRtpTransceiver): string => (t.mid ?? 'null') + ':' + t.direction + '/' + (t.currentDirection ?? 'null')).join(' ')}`);
  console.log(`a current ${a.getTransceivers().map((t: RTCRtpTransceiver): string => (t.mid ?? 'null') + ':' + (t.currentDirection ?? 'null')).join(' ')}`);
  await until(() => a.connectionState === 'connected' && b.connectionState === 'connected');
  console.log('connected');

  // video: the size, the picture, the rate
  const rv = got[0].kind === 'video' ? got[0] : got[1], ra = got[0].kind === 'audio' ? got[0] : got[1];
  const video = rv.camera as RemoteVideo, audio = ra.microphone as RemoteAudio;
  await until(() => video.frameIndex >= 45);
  const mime = (await sent(vs, 'outbound-rtp')).codecId;
  const codec = await stat(a, 'codec', '');
  console.log(`video ${video.width}x${video.height}, settings ${rv.getSettings().width}x${rv.getSettings().height}, codec ${yes(mime !== '' && (codec.mimeType === 'video/VP8' || codec.mimeType === 'video/H264' || codec.mimeType === 'audio/opus'))}`);
  const q = psnr(cam.snapshot(), video.snapshot(), 320, 240);
  console.log(`picture: PSNR of the bars above 30 dB ${yes(q > 30)}`);
  if (q <= 30) console.log(`  (PSNR ${q})`);
  const out = await sent(vs, 'outbound-rtp'), inb = await stat(b, 'inbound-rtp', 'video');
  console.log(`rate: sent ${yes(out.framesPerSecond >= 10)}, decoded ${yes(inb.framesPerSecond >= 10)}, decoded <= encoded ${yes(inb.framesDecoded <= out.framesEncoded)}`);
  if (out.framesPerSecond < 10 || inb.framesPerSecond < 10) console.log(`  (fps ${out.framesPerSecond} ${inb.framesPerSecond})`);

  // a key frame on request
  const keys = out.keyFramesEncoded, plis = out.pliCount;
  for (const r of b.getReceivers()) r.requestKeyFrame();
  const t0 = video.frameIndex;
  await until(() => video.frameIndex > t0 + 15);
  const after = await sent(vs, 'outbound-rtp');
  console.log(`PLI: the sender saw it ${yes(after.pliCount > plis)}, sent a key frame ${yes(after.keyFramesEncoded > keys)}`);

  // audio: the tone of the fake microphone (a triangle of 480 Hz) and its level
  const heard: number[] = [];
  audio.onData((s: number[]) => { if (heard.length < 48000) for (const v of s) heard.push(v); });
  await until(() => heard.length >= 48000);
  const tail = heard.slice(9600);
  const p480 = power(tail, 480), p1000 = power(tail, 1000), p3000 = power(tail, 3000);
  console.log(`audio: 480 Hz above 1 kHz x10 ${yes(p480 > p1000 * 10)}, above 3 kHz x10 ${yes(p480 > p3000 * 10)}, level ${yes(audio.level() > 0.02 && audio.level() < 0.6)}, settings ${ra.getSettings().sampleRate} Hz`);

  // a disabled track: black and silence; enabled again: the picture comes back
  cam.enabled = false; mic.enabled = false;
  let f0 = video.frameIndex;
  await until(() => video.frameIndex > f0 + 10);
  const quiet: number[] = [];
  audio.onData((s: number[]) => { if (quiet.length < 9600) for (const v of s) quiet.push(Math.abs(v)); });
  await until(() => quiet.length >= 9600);
  const loud = quiet.slice(4800).reduce((m: number, v: number) => Math.max(m, v), 0);
  console.log(`disabled: black ${yes(luma(video.snapshot()) < 24)}, silent ${yes(loud < 0.02)}`);
  cam.enabled = true; mic.enabled = true;
  f0 = video.frameIndex;
  await until(() => video.frameIndex > f0 + 15);
  const q2 = psnr(cam.snapshot(), video.snapshot(), 320, 240);
  console.log(`enabled: picture back ${yes(q2 > 30)}`);
  if (q2 <= 30) console.log(`  (PSNR ${q2})`);

  // replaceTrack: a camera of another size, no new negotiation
  const small = (await navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120 } })).getVideoTracks()[0];
  await vs.replaceTrack(small);
  await until(() => video.width === 160);
  console.log(`replaceTrack: ${video.width}x${video.height}, signaling ${a.signalingState}`);
  try { await vs.replaceTrack(mic); } catch (e) { console.log('replaceTrack with audio: ' + (e as Error).name); }
  await vs.replaceTrack(cam);
  await until(() => video.width === 320);

  // setParameters: half the size, a bitrate cap
  const p = vs.getParameters();
  console.log(`parameters: ${p.encodings.length} encoding, codecs ${p.codecs.length}`);
  p.encodings[0].scaleResolutionDownBy = 2;
  p.encodings[0].maxBitrate = 200000;
  await vs.setParameters(p);
  await until(() => video.width === 160);
  f0 = video.frameIndex;
  await until(() => video.frameIndex > f0 + 5);
  const capped = await sent(vs, 'outbound-rtp');
  console.log(`scaled: ${video.width}x${video.height}, target bitrate within the cap ${yes(capped.targetBitrate > 0 && capped.targetBitrate <= 200000)}`);
  try { await vs.setParameters({ transactionId: '', encodings: [], codecs: [] } as RTCRtpSendParameters); } catch (e) { console.log('no encoding: ' + (e as DOMException).name); }
  p.encodings[0].scaleResolutionDownBy = 1; p.encodings[0].maxBitrate = 0;
  await vs.setParameters(p);
  await until(() => video.width === 320);

  // stats
  const all = await a.getStats(), bAll = await b.getStats();
  const types: string[] = [];
  all.forEach((s: RTCStats) => { if (types.indexOf(s.type) < 0) types.push(s.type); });
  bAll.forEach((s: RTCStats) => { if (types.indexOf(s.type) < 0) types.push(s.type); });
  types.sort((x: string, y: string) => x < y ? -1 : x > y ? 1 : 0);
  console.log(`stats types: ${types.join(' ')}`);
  const o = await stat(a, 'outbound-rtp', 'video'), ri = await stat(a, 'remote-inbound-rtp', 'video'), iv = await stat(b, 'inbound-rtp', 'video'), ia = await stat(b, 'inbound-rtp', 'audio');
  const tr = await stat(a, 'transport', ''), cp = await stat(a, 'candidate-pair', '');
  console.log(`outbound: bytes ${yes(o.bytesSent > 1000)} packets ${yes(o.packetsSent >= o.framesEncoded)} size ${o.frameWidth}x${o.frameHeight} keyframes ${yes(o.keyFramesEncoded >= 1)} encode time ${yes(o.totalEncodeTime > 0)} codec ${yes(all.has(o.codecId))}`);
  console.log(`remote-inbound: rtt ${yes(ri.roundTripTime > 0 && ri.roundTripTime < 1)} lost and fraction reported ${yes(ri.packetsLost >= 0 && ri.fractionLost >= 0 && ri.fractionLost <= 1)}`);
  console.log(`inbound video: bytes ${yes(iv.bytesReceived > 1000)} packets ${yes(iv.packetsReceived > 10)} lost ${iv.packetsLost} jitter ${yes(iv.jitter >= 0 && iv.jitter < 0.5)} decoded ${yes(iv.framesDecoded > 30)} size ${iv.frameWidth}x${iv.frameHeight}`);
  console.log(`inbound audio: packets ${yes(ia.packetsReceived > 20)} samples ${yes(ia.totalSamplesReceived > 48000)} jitter ${yes(ia.jitter >= 0 && ia.jitter < 0.5)}`);
  console.log(`transport counts media ${yes(tr.bytesSent > o.bytesSent)}, candidate pair rtt ${yes(cp.currentRoundTripTime > 0)}`);

  // removeTrack and a new negotiation: the peer's transceiver stops receiving
  needed = 0;
  a.removeTrack(as);
  console.log(`removeTrack: sender track ${as.track === null ? 'null' : 'set'}, direction ${a.getTransceivers()[1].direction}`);
  await until(() => needed > 0);
  await negotiate(a, b);
  console.log(`after: a ${a.getTransceivers().map((t: RTCRtpTransceiver): string => t.currentDirection ?? 'null').join(' ')} b ${b.getTransceivers().map((t: RTCRtpTransceiver): string => t.currentDirection ?? 'null').join(' ')}`);

  // directions: the video sendonly, then inactive (no frames), then sendrecv again
  const vt = a.getTransceivers()[0];
  vt.direction = 'sendonly';
  await negotiate(a, b);
  console.log(`sendonly: a ${vt.currentDirection} b ${b.getTransceivers()[0].currentDirection}`);
  vt.direction = 'inactive';
  await negotiate(a, b);
  // 30 camera frames later the encoder has taken none of them (one in flight at most)
  const still = (await sent(vs, 'outbound-rtp')).framesEncoded, c0 = cam.frameIndex;
  await until(() => cam.frameIndex > c0 + 30);
  const later = (await sent(vs, 'outbound-rtp')).framesEncoded;
  console.log(`inactive: a ${vt.currentDirection} b ${b.getTransceivers()[0].currentDirection}, frames stopped ${yes(later <= still + 1)}`);
  vt.direction = 'sendrecv';
  await negotiate(a, b);
  const back = video.frameIndex;
  await until(() => video.frameIndex > back + 10);
  console.log(`sendrecv: a ${vt.currentDirection}, frames again`);
  try { vt.direction = 'sideways'; } catch (e) { console.log('bad direction: ' + (e as Error).name); }

  a.close(); b.close();
  console.log(`closed: a ${a.connectionState}, remote track ${rv.readyState}, transceiver ${vt.currentDirection}`);

  // codecs: VP8 by setCodecPreferences, then by an edited offer (the other codecs taken out), on new connections
  for (const how of ['preferences', 'munging']) {
    const c = new RTCPeerConnection(), d = new RTCPeerConnection();
    link(c, d);
    const t = c.addTransceiver(cam, { direction: 'sendonly' });
    let offer = await c.createOffer();
    if (how === 'preferences') {
      const vp8 = (RTCRtpReceiver.getCapabilities('video') as RTCRtpCapabilities).codecs.filter((x: RTCRtpCodec) => x.mimeType === 'video/VP8');
      t.setCodecPreferences(vp8);
      try { t.setCodecPreferences([{ mimeType: 'video/AV1', clockRate: 90000 }]); } catch (e) { console.log('AV1 preference: ' + (e as DOMException).name); }
      offer = await c.createOffer();
    } else {
      // keep only VP8 (payload type 96) in the m=video line and drop the other codecs' attribute lines
      const lines = (offer.sdp ?? '').split('\r\n').filter((l: string) => !(l.startsWith('a=rtpmap:102') || l.startsWith('a=fmtp:102') || l.startsWith('a=rtcp-fb:102')));
      offer = { type: 'offer', sdp: lines.map((l: string) => l.startsWith('m=video') ? 'm=video 9 UDP/TLS/RTP/SAVPF 96' : l).join('\r\n') };
    }
    const vp8Only = (offer.sdp ?? '').indexOf('H264') < 0 || how === 'munging';
    let rx: MediaStreamTrack | null = null;
    d.ontrack = (e: RTCTrackEvent) => { rx = e.track; };
    await c.setLocalDescription(offer);
    const ld = c.localDescription;
    await d.setRemoteDescription(ld === null ? offer : (ld as RTCSessionDescription).toJSON());
    const answer = await d.createAnswer();
    await d.setLocalDescription(answer);
    await c.setRemoteDescription(answer);
    await until(() => rx !== null && ((rx as MediaStreamTrack).camera as RemoteVideo).frameIndex >= 5);
    const sc = await sent(t.sender, 'codec');
    console.log(`${how}: offer VP8 only ${yes(vp8Only && (c.localDescription === null ? '' : (c.localDescription as RTCSessionDescription).sdp).indexOf('H264') < 0)}, sent ${sc.mimeType}, current ${t.currentDirection}, frames ${yes(((rx as MediaStreamTrack).camera as RemoteVideo).frameIndex >= 5)}`);
    c.close(); d.close();
  }
  for (const t of local.getTracks()) t.stop();
  small.stop();
  console.log('done');
}
main();
