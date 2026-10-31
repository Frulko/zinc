// zinc:webrtc on a bad network (tests/t1/webrtc_impair.sh): the call of examples/webrtc-call ("This window": the fake camera and
// microphone to an echo peer in this process) under ZINC_WEBRTC_IMPAIR, which the script sets per profile. Prints one JSON line of what
// the receiving side measured: audio concealment, the longest gap heard, loss, jitter, round trip, bit rates (payload and on the wire),
// video frames, freezes and size. Arguments: seconds, 'av' or 'audio', 'low' for the ultra low data mode, a name for the line.
import { RTCPeerConnection, RTCStats, RTCPeerConnectionIceEvent, RTCIceCandidate, RTCTrackEvent, RemoteAudio, RemoteVideo, setLowDataMode } from 'zinc:webrtc';
import 'zinc:camera';
import 'zinc:microphone';
import { navigator, MediaStreamTrack } from 'zinc:web';
import * as sys from 'zinc:sys';

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 5); });
}
function wait(ms: number): Promise<void> { return new Promise<void>((done: () => void) => { setTimeout(() => done(), ms); }); }
const r1 = (v: number): number => Math.round(v * 10) / 10;

class Totals {
  audioBytes: number = 0; audioWire: number = 0; audioPackets: number = 0; videoBytes: number = 0; videoWire: number = 0;
  received: number = 0; concealed: number = 0; fec: number = 0; dred: number = 0;
  jbDelay: number = 0; jbTarget: number = 0; emitted: number = 0; inserted: number = 0; removed: number = 0; m2e: number = 0; m2eCount: number = 0; lost: number = 0; jitter: number = 0; frames: number = 0; width: number = 0; plis: number = 0; rtt: number = 0;
}
async function totals(a: RTCPeerConnection, b: RTCPeerConnection): Promise<Totals> {
  const t = new Totals();
  (await a.getStats()).forEach((x: RTCStats) => {
    if (x.type === 'outbound-rtp' && x.kind === 'audio') { t.audioBytes = x.bytesSent; t.audioWire = x.wireBytesSent; t.audioPackets = x.packetsSent; }
    if (x.type === 'outbound-rtp' && x.kind === 'video') { t.videoBytes = x.bytesSent; t.videoWire = x.wireBytesSent; t.width = x.frameWidth; }
    if (x.type === 'remote-inbound-rtp' && x.kind === 'audio') t.rtt = x.roundTripTime;
  });
  (await b.getStats()).forEach((x: RTCStats) => {
    if (x.type === 'inbound-rtp' && x.kind === 'audio') { t.received = x.totalSamplesReceived; t.concealed = x.concealedSamples; t.fec = x.fecSamples; t.dred = x.dredSamples;
      t.jbDelay = x.jitterBufferDelay; t.jbTarget = x.jitterBufferTargetDelay; t.emitted = x.jitterBufferEmittedCount;
      t.inserted = x.insertedSamplesForDeceleration; t.removed = x.removedSamplesForAcceleration; t.m2e = x.totalMouthToEarDelay; t.m2eCount = x.mouthToEarCount; t.lost = x.packetsLost; t.jitter = x.jitter; }
    if (x.type === 'inbound-rtp' && x.kind === 'video') { t.frames = x.framesDecoded; t.plis = x.pliCount; }
  });
  return t;
}

async function main(): Promise<void> {
  const args = sys.args();
  const seconds = args.length > 0 ? parseFloat(args[0]) : 20, video = args.length < 2 || args[1] === 'av', low = args.length > 2 && args[2] === 'low';
  const name = args.length > 3 ? args[3] : 'call';
  const local = await navigator.mediaDevices.getUserMedia(video ? { video: { width: 320, height: 240, frameRate: 30 }, audio: true } : { audio: true });
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) b.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  b.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) a.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  const got: MediaStreamTrack[] = [];
  b.ontrack = (e: RTCTrackEvent) => { got.push(e.track); };
  for (const t of local.getTracks()) a.addTrack(t, local);
  const offer = await a.createOffer();
  await a.setLocalDescription(offer); await b.setRemoteDescription(offer);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer); await a.setRemoteDescription(answer);
  await until(() => a.connectionState === 'connected' && b.connectionState === 'connected');
  if (low) await setLowDataMode(a, true, 'tiny');

  // what is heard: the longest run of 10 ms windows under -40 dB (the fake microphone never goes under -31 dB)
  let quietRun = 0, maxGap = 0, sum = 0, n = 0;
  // what is seen: the longest time without a new frame, and the number of those over 500 ms (freezes)
  let lastFrameAt = -1, maxFreeze = 0, freezes = 0;
  for (const t of got) {
    if (t.kind === 'audio') (t.microphone as RemoteAudio).onData((s: number[]) => {
      for (const v of s) {
        sum += v * v; n++;
        if (n === 480) { if (Math.sqrt(sum / n) < 0.01) { quietRun += 10; if (quietRun > maxGap) maxGap = quietRun; } else quietRun = 0; sum = 0; n = 0; }
      }
    });
    if (t.kind === 'video') (t.camera as RemoteVideo).onFrame(() => {
      const now = Date.now();
      if (lastFrameAt >= 0) { const d = now - lastFrameAt; if (d > maxFreeze) maxFreeze = d; if (d > 500) freezes++; }
      lastFrameAt = now;
    });
  }
  await wait(1000);   // the start (the first key frame, the decoders) is not part of the measure
  maxGap = 0; maxFreeze = 0; freezes = 0;
  const t0 = await totals(a, b), at0 = Date.now();
  const half = seconds * 500;
  await wait(half);
  const tm = await totals(a, b), atm = Date.now();
  await wait(seconds * 1000 - half - 3000);
  const t2 = await totals(a, b);
  await wait(3000);
  const t1 = await totals(a, b), at1 = Date.now();
  if (video && lastFrameAt >= 0 && at1 - lastFrameAt > maxFreeze) { maxFreeze = at1 - lastFrameAt; if (maxFreeze > 500) freezes++; }
  const kbps = (bytes: number, ms: number): number => r1(bytes * 8 / ms);
  const samples = t1.received - t0.received + t1.concealed - t0.concealed + t1.fec - t0.fec + t1.dred - t0.dred;
  const sentPackets = t1.audioPackets - t0.audioPackets;
  const line = new Map<string, number>();
  line.set('seconds', r1((at1 - at0) / 1000));
  line.set('concealedPct', samples > 0 ? r1((t1.concealed - t0.concealed) * 100 / samples) : 100);
  line.set('fecPct', samples > 0 ? r1((t1.fec - t0.fec) * 100 / samples) : 0);
  line.set('dredPct', samples > 0 ? r1((t1.dred - t0.dred) * 100 / samples) : 0);
  line.set('maxGapMs', maxGap);
  // the jitter buffer: its target over the second half and the last 3 s, the delay of the samples, mouth to ear, the time scaling
  const avgMs = (sum: number, count: number): number => count > 0 ? Math.round(sum * 1000 / count) : 0;
  line.set('jbTargetMs', avgMs(t1.jbTarget - tm.jbTarget, t1.emitted - tm.emitted));
  line.set('jbTargetEndMs', avgMs(t1.jbTarget - t2.jbTarget, t1.emitted - t2.emitted));
  line.set('jbDelayMs', avgMs(t1.jbDelay - t0.jbDelay, t1.received - t0.received));
  line.set('mouthToEarMs', avgMs(t1.m2e - t0.m2e, t1.m2eCount - t0.m2eCount));
  line.set('stretchPct', samples > 0 ? r1((t1.inserted - t0.inserted + t1.removed - t0.removed) * 100 / samples) : 0);
  line.set('audioLossPct', sentPackets > 0 ? r1((t1.lost - t0.lost) * 100 / sentPackets) : 0);
  line.set('jitterMs', r1(t1.jitter * 1000));
  line.set('rttMs', Math.round(t1.rtt * 1000));
  line.set('audioKbps', kbps(t1.audioBytes - t0.audioBytes, at1 - at0));
  line.set('audioWireKbps', kbps(t1.audioWire - t0.audioWire, at1 - at0));
  if (video) {
    line.set('videoKbps1', kbps(tm.videoBytes - t0.videoBytes, atm - at0));   // first half, then second half (after a rate step)
    line.set('videoKbps2', kbps(t1.videoBytes - tm.videoBytes, at1 - atm));
    line.set('videoWireKbps2', kbps(t1.videoWire - tm.videoWire, at1 - atm));
    line.set('fps', r1((t1.frames - t0.frames) * 1000 / (at1 - at0)));
    line.set('freezes', freezes);
    line.set('maxFreezeMs', maxFreeze);
    line.set('plis', t1.plis - t0.plis);
    line.set('width', t1.width);
  }
  const fields: string[] = ['"profile":' + JSON.stringify(name)];
  line.forEach((v: number, k: string) => { fields.push(JSON.stringify(k) + ':' + String(v)); });
  console.log('{' + fields.join(',') + '}');
  a.close(); b.close();
  for (const t of local.getTracks()) t.stop();
}
main();
