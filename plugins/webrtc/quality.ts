// zinc:webrtc/quality: getStats()'s counter sets (RTCStats) and what a call's health is made of (CallQuality, mosOf), with no native
// code: zinc:webrtc re-exports them, and another transport (zinc:discord-voice) fills the same RTCStats so CallQuality and the kit's
// CallStats panel read it too.

/** A counter set of getStats(), as on the Web; the fields of the other types stay 0 or ''. Types: 'peer-connection' (dataChannelsOpened,
 *  dataChannelsClosed), 'transport' (bytes of the channels and the media, messages of the channels), 'candidate-pair' (the addresses in
 *  use, currentRoundTripTime), 'outbound-rtp' (what a transceiver sends: bytesSent, packetsSent, framesEncoded, keyFramesEncoded,
 *  framesPerSecond, frameWidth, frameHeight, pliCount, totalEncodeTime, targetBitrate), 'remote-inbound-rtp' (the peer's reports on it:
 *  roundTripTime, fractionLost, packetsLost, jitter), 'inbound-rtp' (what it receives: bytesReceived, packetsReceived, packetsLost, jitter,
 *  framesDecoded, framesDropped, keyFramesDecoded, framesPerSecond, frameWidth, frameHeight, totalSamplesReceived, concealedSamples, pliCount),
 *  'candidate-pair' also availableOutgoingBitrate (the peer's REMB estimate, else what the encoders aim at), 'codec'
 *  (mimeType, payloadType, clockRate, channels, sdpFmtpLine). Times are in seconds; packetsSent counts the 1200-byte fragments of each frame. */
export class RTCStats {
  id: string; type: string; timestamp: number;
  bytesSent: number = 0; bytesReceived: number = 0; messagesSent: number = 0; messagesReceived: number = 0;
  dataChannelsOpened: number = 0; dataChannelsClosed: number = 0;
  localAddress: string = ''; remoteAddress: string = ''; state: string = '';
  /** 'audio' or 'video' for the RTP types. */
  kind: string = ''; mid: string = ''; ssrc: number = 0; codecId: string = ''; localId: string = ''; remoteId: string = ''; trackIdentifier: string = '';
  packetsSent: number = 0; packetsReceived: number = 0; packetsLost: number = 0; jitter: number = 0; fractionLost: number = 0;
  roundTripTime: number = 0; currentRoundTripTime: number = 0;
  framesEncoded: number = 0; framesDecoded: number = 0; keyFramesEncoded: number = 0; keyFramesDecoded: number = 0; framesPerSecond: number = 0;
  frameWidth: number = 0; frameHeight: number = 0; pliCount: number = 0; totalEncodeTime: number = 0; targetBitrate: number = 0;
  totalSamplesReceived: number = 0; concealedSamples: number = 0; framesDropped: number = 0; availableOutgoingBitrate: number = 0;
  /** Zinc, outbound-rtp: the peer's REMB estimate for this stream (bit/s, 0 when it sends none). */
  rembBitrate: number = 0;
  /** As on the Web: inbound-rtp, the packets this side asked again (generic NACK); outbound-rtp, the packets the peer asked again. */
  nackCount: number = 0;
  /** outbound-rtp video, as on the Web: 'bandwidth' while the rate sends a smaller picture or fewer frames than the source's, else 'none'. */
  qualityLimitationReason: string = '';
  /** Zinc, outbound-rtp: the bytes of its RTP packets on the wire (IPv4, UDP, SRTP and RTP headers, payload, retransmissions included). */
  wireBytesSent: number = 0;
  /** inbound-rtp audio: packets rebuilt from the next packet's in-band FEC; Zinc: the samples those gave, and the samples rebuilt from
   *  Opus deep redundancy (DRED, between Zinc peers). Neither counts in concealedSamples. */
  fecPacketsReceived: number = 0; fecSamples: number = 0; dredSamples: number = 0;
  /** inbound-rtp audio, as on the Web: seconds x samples spent in the jitter buffer and aimed at, the samples given out, and the samples
   *  time-scaling added or took away while the buffer moved toward its target. */
  jitterBufferDelay: number = 0; jitterBufferTargetDelay: number = 0; jitterBufferEmittedCount: number = 0;
  insertedSamplesForDeceleration: number = 0; removedSamplesForAcceleration: number = 0;
  /** Zinc, inbound-rtp audio: seconds from capture to playout summed over mouthToEarCount packets; known only for a call between two peer
   *  connections of one process (the loopback). */
  totalMouthToEarDelay: number = 0; mouthToEarCount: number = 0;
  mimeType: string = ''; payloadType: number = 0; clockRate: number = 0; channels: number = 0; sdpFmtpLine: string = '';
  constructor(id: string, type: string) { this.id = id; this.type = type; this.timestamp = Date.now(); }
}

/** One reading of CallQuality: the call's health over the last interval. lossPct is the larger of what this side lost and what the peer
 *  reports losing of ours; rttMs -1 before the first receiver report; kbit/s from the byte counts since the previous reading. */
export class QualitySample {
  /** 'good', 'fair' or 'poor' from mos (4.0 and over, 3.6 and over, under); 'unknown' before the first interval. */
  quality: string = 'unknown';
  /** Mean opinion score, 1 to 4.5, by the E-model (ITU-T G.107) simplified as WebRTC monitors do: latency, jitter and loss. */
  mos: number = 0;
  lossPct: number = 0; rttMs: number = -1; jitterMs: number = 0;
  sendKbps: number = 0; recvKbps: number = 0; availableKbps: number = 0;
  /** The peer's video codec ('VP8') and picture ('640×480 30 fps'), '' without any. */
  videoCodec: string = ''; video: string = '';
  /** The audio codec ('opus'), '' before it is known. */
  audioCodec: string = '';
  framesDropped: number = 0;
  time: number = 0;
}

/** The E-model's MOS of a round trip and a jitter in milliseconds and a loss in percent. */
export function mosOf(rttMs: number, jitterMs: number, lossPct: number): number {
  const lat = Math.max(0, rttMs) / 2 + jitterMs * 2 + 10;
  let r = lat < 160 ? 93.2 - lat / 40 : 93.2 - (lat - 120) / 10;
  r = Math.max(0, Math.min(100, r - lossPct * 2.5));
  return 1 + 0.035 * r + 0.000007 * r * (r - 60) * (100 - r);
}

/** Turns getStats() reports, read every second or so, into QualitySample readings, and keeps the last ones for a graph.
 *
 *    const q = new CallQuality();
 *    setInterval(async () => { q.update(await pc.getStats()); if (q.poorFor >= 5) setLowDataMode(pc, true); }, 1000);
 */
export class CallQuality {
  /** The newest readings, oldest first, at most `keep`. */
  history: QualitySample[] = [];
  last: QualitySample = new QualitySample();
  /** How many readings in a row were poor (0 after a good or fair one). */
  poorFor: number = 0;
  keep: number;
  private sent: number = -1; private recv: number = 0; private got: number = 0; private lost: number = 0; private at: number = 0;
  constructor(keep: number = 60) { this.keep = keep; }
  update(report: Map<string, RTCStats>): QualitySample {
    const q = new QualitySample();
    let sent = 0, recv = 0, got = 0, lost = 0, peerLoss = 0, rtt = -1, jitter = 0, avail = 0, now = 0;
    report.forEach((s: RTCStats): void => {
      now = Math.max(now, s.timestamp);
      if (s.type === 'outbound-rtp') sent += s.bytesSent;
      else if (s.type === 'inbound-rtp') {
        recv += s.bytesReceived; got += s.packetsReceived; lost += s.packetsLost; jitter = Math.max(jitter, s.jitter * 1000);
        q.framesDropped += s.framesDropped;
        if (s.kind === 'video' && s.frameWidth > 0) q.video = `${s.frameWidth}×${s.frameHeight} ${s.framesPerSecond} fps`;
      } else if (s.type === 'remote-inbound-rtp') {
        if (s.roundTripTime > 0) rtt = Math.max(rtt, s.roundTripTime * 1000);
        peerLoss = Math.max(peerLoss, s.fractionLost * 100); jitter = Math.max(jitter, s.jitter * 1000);
      } else if (s.type === 'candidate-pair') avail += s.availableOutgoingBitrate;
      else if (s.type === 'codec') { if (s.mimeType.startsWith('video/')) q.videoCodec = s.mimeType.substring(6); else q.audioCodec = s.mimeType.substring(6); }
    });
    const secs = this.sent >= 0 && now > this.at ? (now - this.at) / 1000 : 0;
    if (secs > 0) {
      q.sendKbps = Math.max(0, (sent - this.sent) * 8 / 1000 / secs);
      q.recvKbps = Math.max(0, (recv - this.recv) * 8 / 1000 / secs);
      const dg = got - this.got, dl = Math.max(0, lost - this.lost);
      q.lossPct = Math.max(dg + dl > 0 ? 100 * dl / (dg + dl) : 0, peerLoss);
      q.rttMs = rtt; q.jitterMs = jitter; q.availableKbps = avail / 1000;
      q.mos = mosOf(rtt, jitter, q.lossPct);
      q.quality = q.mos >= 4 ? 'good' : q.mos >= 3.6 ? 'fair' : 'poor';
      this.poorFor = q.quality === 'poor' ? this.poorFor + 1 : 0;
    }
    q.time = now;
    this.sent = sent; this.recv = recv; this.got = got; this.lost = lost; this.at = now;
    this.last = q;
    this.history.push(q);
    if (this.history.length > this.keep) this.history.shift();
    return q;
  }
  /** Forgets the readings (a new call). */
  reset(): void { this.history = []; this.last = new QualitySample(); this.poorFor = 0; this.sent = -1; }
}
