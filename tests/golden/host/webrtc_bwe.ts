// zinc:webrtc's video rate control on a bad network (tests/t1/webrtc_bwe.sh): the fake camera (with grain, ZINC_FAKE_CAMERA_NOISE, so the
// encoder spends what it is given) to a peer in this process under ZINC_WEBRTC_IMPAIR, which the script sets. Reads getStats every 100 ms
// and prints one JSON line: freezes (no new frame for 500 ms), PLIs, NACKs, the sender's target rate after each rate step of the link, and
// the ladder's rungs it went through (height x frames a second, held at least a second).
// Arguments: seconds, a name, the codec ('VP8' or 'H264'), the camera's width and height, then the link's steps as seconds:bit/s pairs (as the profile's step= key) and
// the rate before the first, to time the sender against them: capMs (the step down until the target is under the new rate), recoverMs (the
// step up until the target is back at 90% of the first second's rate, at the top rung).
import { RTCPeerConnection, RTCStats, RTCPeerConnectionIceEvent, RTCIceCandidate, RTCTrackEvent, RTCRtpSender, RTCRtpCodec, RTCRtpCapabilities, RemoteVideo } from 'zinc:webrtc';
import 'zinc:camera';
import { navigator, MediaStreamTrack } from 'zinc:web';
import * as sys from 'zinc:sys';

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 5); });
}
function wait(ms: number): Promise<void> { return new Promise<void>((done: () => void) => { setTimeout(() => done(), ms); }); }
const r1 = (v: number): number => Math.round(v * 10) / 10;

class Reading {
  at: number = 0; target: number = 0; sentHeight: number = 0; sentFps: number = 0; bytesSent: number = 0;
  height: number = 0; fps: number = 0; frames: number = 0; plis: number = 0; nacks: number = 0; peerNacks: number = 0; lost: number = 0; packets: number = 0;
}
async function read(a: RTCPeerConnection, b: RTCPeerConnection, t0: number): Promise<Reading> {
  const r = new Reading();
  r.at = Date.now() - t0;
  (await a.getStats()).forEach((x: RTCStats) => {
    if (x.type === 'outbound-rtp' && x.kind === 'video') { r.target = x.targetBitrate; r.sentHeight = x.frameHeight; r.sentFps = x.framesPerSecond; r.bytesSent = x.bytesSent; r.peerNacks = x.nackCount; }
  });
  (await b.getStats()).forEach((x: RTCStats) => {
    if (x.type === 'inbound-rtp' && x.kind === 'video') {
      r.height = x.frameHeight; r.fps = x.framesPerSecond; r.frames = x.framesDecoded; r.plis = x.pliCount; r.nacks = x.nackCount; r.lost = x.packetsLost; r.packets = x.packetsReceived;
    }
  });
  return r;
}

async function main(): Promise<void> {
  const args = sys.args();
  const seconds = parseFloat(args[0]), name = args[1], codec = args[2], width = parseInt(args[3]), height = parseInt(args[4]);
  const steps: number[] = [];   // at (ms), rate, at, rate...
  for (let i = 5; i < args.length; i++) for (const p of args[i].split(':')) steps.push(p.endsWith('k') ? parseFloat(p) * 1000 : p.endsWith('M') ? parseFloat(p) * 1e6 : parseFloat(p) * (steps.length % 2 === 0 ? 1000 : 1));
  const local = await navigator.mediaDevices.getUserMedia({ video: { width: width, height: height, frameRate: 30 } });
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) b.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  b.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) a.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  const got: MediaStreamTrack[] = [];
  b.ontrack = (e: RTCTrackEvent) => { got.push(e.track); };
  for (const t of local.getTracks()) a.addTrack(t, local);
  const caps = RTCRtpSender.getCapabilities('video') as RTCRtpCapabilities;
  const want = caps.codecs.filter((c: RTCRtpCodec) => c.mimeType === 'video/' + codec);
  if (want.length === 0) { console.log('{"profile":' + JSON.stringify(name) + ',"skipped":"no ' + codec + '"}'); return; }
  for (const x of a.getTransceivers()) x.setCodecPreferences(want);
  const offer = await a.createOffer();
  await a.setLocalDescription(offer); await b.setRemoteDescription(offer);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer); await a.setRemoteDescription(answer);
  await until(() => a.connectionState === 'connected' && b.connectionState === 'connected');
  const t0 = Date.now();   // about the harness's first packet: its steps count from there

  let lastFrameAt = -1, maxFreeze = 0, freezes = 0, measuring = false;
  for (const t of got) if (t.kind === 'video') (t.camera as RemoteVideo).onFrame(() => {
    const now = Date.now();
    if (measuring && lastFrameAt >= 0) { const d = now - lastFrameAt; if (d > maxFreeze) maxFreeze = d; if (d > 500) freezes++; }
    lastFrameAt = now;
  });
  await wait(1000);   // the first key frame and the decoder are not part of the measure
  measuring = true;
  const readings: Reading[] = [];
  const first = await read(a, b, t0);
  while (Date.now() - t0 < seconds * 1000) { await wait(100); readings.push(await read(a, b, t0)); }
  const last = readings[readings.length - 1];
  // the timeline on stderr, every half second: time, target kbit/s, picture sent, picture received, PLIs, NACKs
  for (const r of readings) if (r.at % 500 < 100) console.error(String(r.at) + ' ' + String(Math.round(r.target / 1000)) + 'k ' + String(r.sentHeight) + 'p' + String(r.sentFps) + ' -> ' + String(r.height) + 'p' + String(r.fps) + ' pli ' + String(r.plis) + ' nack ' + String(r.nacks));
  if (lastFrameAt >= 0 && Date.now() - lastFrameAt > 500) freezes++;

  const span = (last.at - first.at) / 1000;
  const line = new Map<string, number>();
  const fields0: string[] = [];
  line.set('seconds', r1(span));
  fields0.push('"codec":' + JSON.stringify(codec));
  line.set('freezes', freezes);
  line.set('maxFreezeMs', maxFreeze);
  line.set('plis', last.plis - first.plis);
  line.set('plisPerSecond', r1((last.plis - first.plis) / span));
  line.set('nacks', last.nacks - first.nacks);
  line.set('peerNacks', last.peerNacks - first.peerNacks);
  line.set('lossPct', last.packets > first.packets ? r1((last.lost - first.lost) * 100 / (last.packets - first.packets + last.lost - first.lost)) : 0);
  line.set('fps', r1((last.frames - first.frames) / span));
  line.set('kbps', r1((last.bytesSent - first.bytesSent) * 8 / (last.at - first.at)));
  // the full rate: the target of the second before the first step
  let full = 0;
  for (const r of readings) if (r.target > full && (steps.length === 0 || r.at < steps[0])) full = r.target;
  line.set('fullKbps', r1(full / 1000));
  // each step: down, the time until the target is under the new rate; up, until it is back at 90% of the full rate at the top rung
  let top = 0;
  for (const r of readings) if (steps.length === 0 || r.at < steps[0]) top = Math.max(top, r.sentHeight);
  let prevRate = 1e12;
  for (let s = 0; s + 1 < steps.length; s += 2) {
    const at = steps[s], rate = steps[s + 1];
    let ms = -1;
    for (const r of readings) {
      if (r.at < at) continue;
      if (rate < prevRate ? r.target <= rate : r.target >= full * 0.9 && r.sentHeight >= top) { ms = r.at - at; break; }
    }
    line.set((rate < prevRate ? 'capMs' : 'recoverMs') + String(s / 2 + 1), ms);
    prevRate = rate;
  }
  // the rungs: the picture sent, kept when it held a second
  const rungs: string[] = [];
  let cur = '', since = 0;
  for (const r of readings) {
    const k = String(r.sentHeight) + 'p' + String(r.sentFps >= 25 ? 30 : r.sentFps >= 12 ? 15 : r.sentFps >= 5 ? 7 : 0);
    if (k !== cur) { cur = k; since = r.at; }
    else if (r.at - since >= 1000 && (rungs.length === 0 || rungs[rungs.length - 1] !== k)) rungs.push(k);
  }
  const fields: string[] = ['"profile":' + JSON.stringify(name)].concat(fields0);
  line.forEach((v: number, k: string) => { fields.push(JSON.stringify(k) + ':' + String(v)); });
  fields.push('"rungs":' + JSON.stringify(rungs.join(',')));
  console.log('{' + fields.join(',') + '}');
  a.close(); b.close();
  for (const t of local.getTracks()) t.stop();
}
main();
