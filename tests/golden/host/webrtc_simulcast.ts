// zinc:webrtc's VP8 layers (tests/t1/webrtc_simulcast.sh): the fake camera to a peer in this process, VP8, for a few seconds, then one JSON
// line with what the peer decoded and each stream the sender sent (rid, size, frames, bit rate, encode time per frame).
// Arguments: a mode, the camera's width and height, seconds. Modes:
//   L1T1, L1T2  one encoding, in one or two temporal layers (scalabilityMode): the encode cost of the layers;
//   decline     two rid encodings, the peer's answer (ours) does not take simulcast: the first stream goes out alone, and the peer decodes it;
//   accept      two rid encodings, the answer edited as a media server's (a=simulcast:recv, the mid and rid header extensions): both go out
//               (the peer, not a media server, decodes the first stream it gets);
//   low         the same with the first encoding inactive: the second stream alone, which the peer decodes.
import { RTCPeerConnection, RTCStats, RTCPeerConnectionIceEvent, RTCIceCandidate, RTCRtpSender, RTCRtpCodec, RTCRtpCapabilities, RTCRtpEncodingParameters,
         RTCSessionDescriptionInit } from 'zinc:webrtc';
import 'zinc:camera';
import { navigator } from 'zinc:web';
import * as sys from 'zinc:sys';

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 5); });
}
function wait(ms: number): Promise<void> { return new Promise<void>((done: () => void) => { setTimeout(() => done(), ms); }); }
const r1 = (v: number): number => Math.round(v * 10) / 10;

// An answer as a media server writes it to our rids: the video section takes them (RFC 8853) with the header extensions they travel in.
function acceptSimulcast(sdp: string): string {
  const lines = sdp.split('\r\n'), out: string[] = [];
  let video = false;
  for (const l of lines) {
    if (l.startsWith('m=')) video = l.startsWith('m=video');
    out.push(l);
    if (video && l.startsWith('a=mid:'))
      out.push('a=extmap:4 urn:ietf:params:rtp-hdrext:sdes:mid', 'a=extmap:10 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id', 'a=rid:h recv', 'a=rid:l recv', 'a=simulcast:recv h;l');
  }
  return out.join('\r\n');
}

async function main(): Promise<void> {
  const args = sys.args();
  const mode = args[0], width = parseInt(args[1]), height = parseInt(args[2]), seconds = parseFloat(args[3]);
  const local = await navigator.mediaDevices.getUserMedia({ video: { width: width, height: height, frameRate: 30 } });
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) b.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  b.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) a.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
  const enc: RTCRtpEncodingParameters[] = mode === 'L1T1' || mode === 'L1T2' ? [{ scalabilityMode: mode }]
    : [{ rid: 'h', active: mode !== 'low' }, { rid: 'l', scaleResolutionDownBy: 2, maxBitrate: 100000 }];
  const track = local.getVideoTracks()[0];
  const tx = a.addTransceiver(track, { direction: 'sendonly', streams: [local], sendEncodings: enc });
  const caps = RTCRtpSender.getCapabilities('video') as RTCRtpCapabilities;
  tx.setCodecPreferences(caps.codecs.filter((c: RTCRtpCodec) => c.mimeType === 'video/VP8'));
  const offer = await a.createOffer();
  await a.setLocalDescription(offer); await b.setRemoteDescription(offer);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer);
  const sdp = answer.sdp ?? '';
  const edited: RTCSessionDescriptionInit = { type: 'answer', sdp: mode === 'accept' || mode === 'low' ? acceptSimulcast(sdp) : sdp };
  await a.setRemoteDescription(edited);
  await until(() => a.connectionState === 'connected' && b.connectionState === 'connected');
  await wait(seconds * 1000);

  const fields: string[] = ['"mode":' + JSON.stringify(mode), '"offerRids":' + ((offer.sdp ?? '').indexOf('a=simulcast:send h;l') >= 0)];
  (await b.getStats()).forEach((x: RTCStats) => {
    if (x.type === 'inbound-rtp' && x.kind === 'video') fields.push('"decoded":' + x.framesDecoded, '"decodedSize":"' + x.frameWidth + 'x' + x.frameHeight + '"');
  });
  const streams: string[] = [];
  (await a.getStats()).forEach((x: RTCStats) => {
    if (x.type !== 'outbound-rtp' || x.kind !== 'video') return;
    const ms = x.framesEncoded > 0 ? x.totalEncodeTime * 1000 / x.framesEncoded : 0;
    streams.push('{"rid":' + JSON.stringify(x.rid) + ',"size":"' + x.frameWidth + 'x' + x.frameHeight + '","frames":' + x.framesEncoded +
      ',"kbps":' + r1(x.bytesSent * 8 / 1000 / seconds) + ',"encodeMs":' + r1(ms * 100) / 100 + '}');
  });
  fields.push('"streams":[' + streams.join(',') + ']');
  console.log('{' + fields.join(',') + '}');
  a.close(); b.close();
  track.stop();
}
main();
