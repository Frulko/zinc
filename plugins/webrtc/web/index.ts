// zinc:webrtc in the browser (docs/targets/web.md, "Plugins"): the module is the page's own WebRTC. RTCPeerConnection, RTCDataChannel, RTCRtpSender and the rest
// are the browser's classes under the names index.ts gives them, so a program that runs on a desktop runs here, with the browser's codecs, its echo
// cancellation and its hardware encoders. What Zinc adds to the Web API stays: the video and audio tracks of a call read like a camera and a microphone
// (`track.camera` is a RemoteVideo, `track.microphone` a RemoteAudio), which zinc:camera and zinc:microphone install on MediaStreamTrack.
// A browser without WebRTC loads the module all the same; constructing one of its classes throws ZnUnsupported.
import 'zinc:camera';
import 'zinc:microphone';

const g: any = globalThis;
function api(name: string): any {
  if (g[name]) return g[name];
  return function () { throw new g.ZnUnsupported(name, 'this browser has no WebRTC'); };
}

export const RTCPeerConnection = api('RTCPeerConnection'), RTCSessionDescription = api('RTCSessionDescription'), RTCIceCandidate = api('RTCIceCandidate');
export const RTCPeerConnectionIceEvent = api('RTCPeerConnectionIceEvent'), RTCDataChannelEvent = api('RTCDataChannelEvent'), RTCTrackEvent = api('RTCTrackEvent');
export const RTCDataChannel = api('RTCDataChannel'), RTCRtpSender = api('RTCRtpSender'), RTCRtpReceiver = api('RTCRtpReceiver'), RTCRtpTransceiver = api('RTCRtpTransceiver');
// the stats of getStats() are the browser's report (a Map of dictionaries with the W3C field names); these names are types in Zinc
export const RTCStats = undefined, RTCRtpCodec = undefined, RTCRtpCapabilities = undefined, RTCRtpEncodingParameters = undefined, RTCRtpSendParameters = undefined;
export const RTCRtpReceiveParameters = undefined, RTCRtpTransceiverInit = undefined, RTCIceServer = undefined, RTCConfiguration = undefined, RTCSessionDescriptionInit = undefined;
export const RTCIceCandidateInit = undefined, RTCDataChannelInit = undefined;
/** The peer's video and audio as `track.camera` and `track.microphone` read them (zinc:camera's Camera, zinc:microphone's Microphone). */
export const RemoteVideo = undefined, RemoteAudio = undefined;

// Call quality and the ultra low data mode (index.ts has the documentation): the same readings from the browser's report, and the low data
// mode through the browser's setParameters (the browser's Opus picks DTX and FEC itself).
export function mosOf(rttMs: number, jitterMs: number, lossPct: number): number {
  const lat = Math.max(0, rttMs) / 2 + jitterMs * 2 + 10;
  let r = lat < 160 ? 93.2 - lat / 40 : 93.2 - (lat - 120) / 10;
  r = Math.max(0, Math.min(100, r - lossPct * 2.5));
  return 1 + 0.035 * r + 0.000007 * r * (r - 60) * (100 - r);
}
export class QualitySample {
  quality = 'unknown'; mos = 0; lossPct = 0; rttMs = -1; jitterMs = 0; sendKbps = 0; recvKbps = 0; availableKbps = 0;
  videoCodec = ''; video = ''; audioCodec = ''; framesDropped = 0; time = 0;
}
export class CallQuality {
  history: any[] = []; last: any = new QualitySample(); poorFor = 0; keep: number;
  private p: any = null;
  constructor(keep = 60) { this.keep = keep; }
  update(report: any): any {
    const q: any = new QualitySample();
    let sent = 0, recv = 0, got = 0, lost = 0, peerLoss = 0, rtt = -1, jitter = 0, avail = 0, now = 0;
    report.forEach((s: any) => {
      now = Math.max(now, s.timestamp || 0);
      if (s.type === 'outbound-rtp') sent += s.bytesSent || 0;
      else if (s.type === 'inbound-rtp') {
        recv += s.bytesReceived || 0; got += s.packetsReceived || 0; lost += s.packetsLost || 0; jitter = Math.max(jitter, (s.jitter || 0) * 1000);
        q.framesDropped += s.framesDropped || 0;
        if (s.kind === 'video' && s.frameWidth) q.video = `${s.frameWidth}×${s.frameHeight} ${s.framesPerSecond || 0} fps`;
      } else if (s.type === 'remote-inbound-rtp') {
        if (s.roundTripTime > 0) rtt = Math.max(rtt, s.roundTripTime * 1000);
        peerLoss = Math.max(peerLoss, (s.fractionLost || 0) * 100); jitter = Math.max(jitter, (s.jitter || 0) * 1000);
      } else if (s.type === 'candidate-pair' && s.nominated !== false) avail += s.availableOutgoingBitrate || 0;
      else if (s.type === 'codec') { if (s.mimeType.startsWith('video/')) q.videoCodec = s.mimeType.substring(6); else q.audioCodec = s.mimeType.substring(6); }
    });
    const p = this.p, secs = p !== null && now > p.at ? (now - p.at) / 1000 : 0;
    if (secs > 0) {
      q.sendKbps = Math.max(0, (sent - p.sent) * 8 / 1000 / secs); q.recvKbps = Math.max(0, (recv - p.recv) * 8 / 1000 / secs);
      const dg = got - p.got, dl = Math.max(0, lost - p.lost);
      q.lossPct = Math.max(dg + dl > 0 ? 100 * dl / (dg + dl) : 0, peerLoss);
      q.rttMs = rtt; q.jitterMs = jitter; q.availableKbps = avail / 1000;
      q.mos = mosOf(rtt, jitter, q.lossPct);
      q.quality = q.mos >= 4 ? 'good' : q.mos >= 3.6 ? 'fair' : 'poor';
      this.poorFor = q.quality === 'poor' ? this.poorFor + 1 : 0;
    }
    q.time = now;
    this.p = { sent, recv, got, lost, at: now };
    this.last = q; this.history.push(q);
    if (this.history.length > this.keep) this.history.shift();
    return q;
  }
  reset(): void { this.history = []; this.last = new QualitySample(); this.poorFor = 0; this.p = null; }
}
export const LOW_DATA_AUDIO_BPS = 10000;
const saved = new Map<any, any>();
export async function setLowDataMode(pc: any, on: boolean, video = 'tiny'): Promise<void> {
  for (const s of pc.getSenders()) {
    if (!s.track) continue;
    const p = s.getParameters();
    if (!p.encodings || p.encodings.length === 0) p.encodings = [{}];
    if (!on) { if (!saved.has(s)) continue; p.encodings[0] = saved.get(s); saved.delete(s); }
    else {
      if (!saved.has(s)) saved.set(s, { ...p.encodings[0] });
      const e = p.encodings[0];
      if (s.track.kind === 'audio') { e.active = true; e.maxBitrate = LOW_DATA_AUDIO_BPS; }
      else if (video === 'off') e.active = false;
      else { e.active = true; e.maxBitrate = 60000; e.maxFramerate = 5; e.scaleResolutionDownBy = 4; }
    }
    await s.setParameters(p);
  }
}
