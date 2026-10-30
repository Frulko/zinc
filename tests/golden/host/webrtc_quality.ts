// zinc:webrtc call quality and the ultra low data mode (tests/t1/webrtc_quality.sh): the E-model score of known numbers, CallQuality on
// two hand-made reports (loss, round trip, bit rates), then two peer connections in one process with the fake camera and microphone: the
// low data mode brings the audio down to Opus at 6 to 12 kbit/s, DTX sends almost nothing for silence, the video goes tiny or off, and off
// puts the call back. Bit rates are checked against ranges (they come from the codecs in real time); the measured numbers go to stderr.
import { RTCPeerConnection, RTCStats, RTCPeerConnectionIceEvent, RTCIceCandidate, RTCRtpSender, CallQuality, QualitySample, mosOf, setLowDataMode } from 'zinc:webrtc';
import 'zinc:camera';
import 'zinc:microphone';
import { navigator } from 'zinc:web';

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 5); });
}
function wait(ms: number): Promise<void> { return new Promise<void>((done: () => void) => { setTimeout(() => done(), ms); }); }
const yes = (ok: boolean): string => ok ? 'ok' : 'NO';

function report(at: number, sent: number, recv: number, got: number, lost: number, rtt: number): Map<string, RTCStats> {
  const m = new Map<string, RTCStats>();
  const o = new RTCStats('O', 'outbound-rtp'); o.bytesSent = sent; o.timestamp = at; m.set(o.id, o);
  const i = new RTCStats('I', 'inbound-rtp'); i.kind = 'audio'; i.bytesReceived = recv; i.packetsReceived = got; i.packetsLost = lost; i.jitter = 0.004; i.timestamp = at; m.set(i.id, i);
  const r = new RTCStats('R', 'remote-inbound-rtp'); r.roundTripTime = rtt; r.timestamp = at; m.set(r.id, r);
  const c = new RTCStats('C', 'codec'); c.mimeType = 'audio/opus'; c.timestamp = at; m.set(c.id, c);
  return m;
}
// the bytes a sender sent over `ms`, as kbit/s
async function kbps(s: RTCRtpSender, ms: number): Promise<number> {
  const bytes = async (): Promise<number> => { let b = 0; (await s.getStats()).forEach((x: RTCStats) => { if (x.type === 'outbound-rtp') b += x.bytesSent; }); return b; };
  const b0 = await bytes();
  await wait(ms);
  return (await bytes() - b0) * 8 / ms;
}
async function sentSize(s: RTCRtpSender): Promise<number> { let w = 0; (await s.getStats()).forEach((x: RTCStats) => { if (x.type === 'outbound-rtp') w = x.frameWidth; }); return w; }

async function main(): Promise<void> {
  console.log(`mos: clean ${mosOf(20, 2, 0).toFixed(2)}, 5% loss ${mosOf(20, 2, 5).toFixed(2)}, 15% loss ${mosOf(20, 2, 15).toFixed(2)}, 600 ms ${mosOf(600, 10, 0).toFixed(2)}`);
  const q = new CallQuality(3);
  q.update(report(1000, 0, 0, 0, 0, 0.04));
  const a1: QualitySample = q.update(report(2000, 4000, 2000, 50, 0, 0.04));
  console.log(`clean: ${a1.quality} out ${a1.sendKbps} in ${a1.recvKbps} kbit/s, rtt ${a1.rttMs.toFixed(0)} ms, jitter ${a1.jitterMs.toFixed(0)} ms, loss ${a1.lossPct}%, ${a1.audioCodec}`);
  const a2 = q.update(report(3000, 8000, 4000, 90, 10, 0.04));
  console.log(`40 received, 10 lost: ${a2.quality} loss ${a2.lossPct}%, poor for ${q.poorFor}`);
  const a3 = q.update(report(4000, 12000, 6000, 130, 30, 0.3));
  q.update(report(5000, 16000, 8000, 180, 30, 0.04));
  console.log(`40 received, 20 lost: ${a3.quality} loss ${a3.lossPct.toFixed(1)}%; then clean: ${q.last.quality}, poor for ${q.poorFor}, history ${q.history.length}`);

  const local = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 30 }, audio: true });
  const cam = local.getVideoTracks()[0], mic = local.getAudioTracks()[0];
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) b.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  b.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) a.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  const vs = a.addTrack(cam, local), as = a.addTrack(mic, local);
  const offer = await a.createOffer();
  await a.setLocalDescription(offer); await b.setRemoteDescription(offer);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer); await a.setRemoteDescription(answer);
  await until(() => a.connectionState === 'connected' && b.connectionState === 'connected');
  await wait(1000);
  const normalA = await kbps(as, 2000), normalV = await kbps(vs, 2000);
  console.log(`normal: audio over 20 kbit/s ${yes(normalA > 20)}, video over 30 kbit/s ${yes(normalV > 30)}`);

  await setLowDataMode(a, true);
  await wait(1000);
  const lowA = await kbps(as, 3000), lowV = await kbps(vs, 3000), w = await sentSize(vs);
  console.log(`low data: audio 6 to 12 kbit/s ${yes(lowA >= 6 && lowA <= 12)}, video at most 70 kbit/s ${yes(lowV <= 70)}, ${w} pixels wide`);
  mic.enabled = false;   // silence: DTX
  await wait(500);
  const dtx = await kbps(as, 3000);
  console.log(`low data, silent: audio under 2 kbit/s (DTX) ${yes(dtx < 2)}`);
  mic.enabled = true;
  await setLowDataMode(a, true, 'off');   // already on: the video stops, the saved encodings stay the first ones
  await wait(500);
  const offV = await kbps(vs, 1500);
  console.log(`video off: ${yes(offV < 1)}`);
  await setLowDataMode(a, false);
  await wait(1500);
  const backA = await kbps(as, 2000), backV = await kbps(vs, 2000);
  console.log(`back: audio over 20 kbit/s ${yes(backA > 20)}, video over 30 kbit/s ${yes(backV > 30)}, ${await sentSize(vs)} pixels wide`);
  console.error(`measured kbit/s (payload): normal audio ${normalA.toFixed(1)} video ${normalV.toFixed(1)}; low audio ${lowA.toFixed(1)} video ${lowV.toFixed(1)}; silent ${dtx.toFixed(2)}; video off ${offV.toFixed(2)}; back audio ${backA.toFixed(1)} video ${backV.toFixed(1)}`);
  a.close(); b.close();
  for (const t of local.getTracks()) t.stop();
}
main();
