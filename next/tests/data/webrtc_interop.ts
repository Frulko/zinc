// zinc:webrtc against a browser (tools/webrtc-interop drives it with headless Chrome): the fake camera and microphone sent to the page and
// the page's fake camera and microphone received. The signalling is two files in INTEROP_DIR: this program writes offer.json (every
// candidate in it), the driver writes answer.json. INTEROP_CODEC=video/VP8 or video/H264 puts that codec first; INTEROP_ROLE=answer
// waits for the page's offer.json and writes answer.json instead. Prints what it received; the driver reads what the page received.
import { RTCPeerConnection, RTCTrackEvent, RTCStats, RTCRtpReceiver, RTCRtpCodec, RTCRtpCapabilities, RTCRtpTransceiver, RTCSessionDescription,
         RemoteVideo, RemoteAudio } from 'zinc:webrtc';
import 'zinc:camera';
import 'zinc:microphone';
import { navigator, MediaStreamTrack } from 'zinc:web';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';

const dir = env('INTEROP_DIR'), codec = env('INTEROP_CODEC'), answering = env('INTEROP_ROLE') === 'answer';
function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 20); });
}
function prefer(t: RTCRtpTransceiver): void {
  if (codec === '' || t.receiver.track.kind !== 'video') return;
  const all = (RTCRtpReceiver.getCapabilities('video') as RTCRtpCapabilities).codecs;
  t.setCodecPreferences(all.filter((c: RTCRtpCodec) => c.mimeType === codec).concat(all.filter((c: RTCRtpCodec) => c.mimeType !== codec)));
}

async function main(): Promise<void> {
  const local = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: true });
  const pc = new RTCPeerConnection();
  const got: MediaStreamTrack[] = [];
  pc.ontrack = (e: RTCTrackEvent) => { got.push(e.track); };
  const desc = (): string => { const d = pc.localDescription; return d === null ? '' : JSON.stringify((d as RTCSessionDescription).toJSON()); };
  if (!answering) {
    for (const t of local.getTracks()) pc.addTrack(t, local);
    for (const t of pc.getTransceivers()) prefer(t);
    await pc.setLocalDescription(await pc.createOffer());
    await until(() => pc.iceGatheringState === 'complete');
    fs.writeText(dir + '/offer.json', desc());
    await until(() => fs.exists(dir + '/answer.json'));
    const a: any = JSON.parse(fs.readText(dir + '/answer.json'));
    await pc.setRemoteDescription({ type: 'answer', sdp: a.sdp as string });
  } else {
    await until(() => fs.exists(dir + '/offer.json'));
    const o: any = JSON.parse(fs.readText(dir + '/offer.json'));
    await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp as string });
    for (const t of local.getTracks()) pc.addTrack(t, local);
    for (const t of pc.getTransceivers()) prefer(t);
    await pc.setLocalDescription(await pc.createAnswer());
    await until(() => pc.iceGatheringState === 'complete');
    fs.writeText(dir + '/answer.json', desc());
  }
  await until(() => pc.connectionState === 'connected' || pc.connectionState === 'failed');
  console.log(`zinc: ${pc.connectionState}`);
  const v = got.filter((t: MediaStreamTrack) => t.kind === 'video'), a = got.filter((t: MediaStreamTrack) => t.kind === 'audio');
  if (v.length === 0 || a.length === 0) { console.log(`zinc: tracks from the page: ${got.map((t: MediaStreamTrack) => t.kind).join(' ')}`); pc.close(); return; }
  const video = v[0].camera as RemoteVideo, audio = a[0].microphone as RemoteAudio;
  let heard = 0, loudest = 0;
  audio.onData((s: number[]) => { heard += s.length; for (const v of s) loudest = Math.max(loudest, Math.abs(v)); });
  await until(() => video.frameIndex >= 30 && heard >= 48000);
  let rtt = 0;
  (await pc.getStats()).forEach((s: RTCStats) => { if (s.type === 'remote-inbound-rtp' && s.roundTripTime > 0) rtt = s.roundTripTime; });
  console.log(`zinc: round trip from the page's reports ${rtt > 0 ? 'measured' : 'not measured'}`);
  const t =pc.getTransceivers().filter((x: RTCRtpTransceiver) => x.receiver.track.kind === 'video')[0];
  console.log(`zinc: received video ${video.width}x${video.height} (${t.recvCodec}), audio ${heard >= 48000 ? 'one second' : 'less'}, ${loudest > 0.01 ? 'not silent' : 'silent'}; sending ${t.sendCodec}`);
  fs.writeText(dir + '/zinc.done', 'ok');
  await until(() => fs.exists(dir + '/page.done'));
  pc.close();
  for (const tr of local.getTracks()) tr.stop();
}
main();
