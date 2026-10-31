// zinc:webrtc — WebRTC (docs/plugins/webrtc.md): RTCPeerConnection, RTCDataChannel, RTCSessionDescription, RTCIceCandidate, audio and video
// tracks (addTrack, addTransceiver, RTCRtpSender, RTCRtpReceiver, RTCRtpTransceiver, ontrack) and getStats, as on the Web. The native side
// (native/webrtc.spec.ts) is libdatachannel with the codecs; its threads queue what happens and this file takes the queue on a timer while
// a connection or a channel lives, then fires the events on the program's thread. The same timer hands the frames of the tracks sent to
// the native side and takes the peer's decoded frames and samples.
// On the Zinc engines the names are globals (the compiler adds the import); on QuickJS import them from 'zinc:webrtc'.
// Not here yet: simulcast and SVC, screen sharing, insertable streams, DTMF, restartIce, setConfiguration, certificates.
import S from './native/webrtc.spec';
import { Event, EventTarget, DOMException, MessageEvent, ErrorEvent, Blob, reportError, MediaStream, MediaStreamTrack, MediaTrackSettings, crypto } from 'zinc:web';
import { RTCStats } from './quality';
export { RTCStats, QualitySample, mosOf, CallQuality } from './quality';

const FS = '\u001f', RS = '\u001e';
const CONNECTION: string[] = ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'];
const ICE: string[] = ['new', 'checking', 'connected', 'completed', 'failed', 'disconnected', 'closed'];
const GATHERING: string[] = ['new', 'gathering', 'complete'];
const SIGNALING: string[] = ['stable', 'have-local-offer', 'have-remote-offer', 'have-local-pranswer', 'have-remote-pranswer'];

/** urls: a string or a string[] ("stun:host:port", "turn:host:port?transport=udp", "turns:..."); username and credential for TURN. */
export interface RTCIceServer { urls: unknown; username?: string; credential?: string }
/** iceServers [] (the default): host candidates only, which is all a LAN or the in-process loopback needs. iceTransportPolicy 'relay':
 *  only TURN candidates. */
export interface RTCConfiguration { iceServers?: RTCIceServer[]; iceTransportPolicy?: string }
/** type: 'offer', 'answer' or 'pranswer'. */
export interface RTCSessionDescriptionInit { type: string; sdp?: string }
export interface RTCIceCandidateInit { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null }
/** ordered (true), maxPacketLifeTime (ms) or maxRetransmits for a partially reliable channel, protocol, negotiated with an id. */
export interface RTCDataChannelInit { ordered?: boolean; maxPacketLifeTime?: number; maxRetransmits?: number; protocol?: string; negotiated?: boolean; id?: number }

export class RTCSessionDescription {
  readonly type: string;
  readonly sdp: string;
  constructor(init: RTCSessionDescriptionInit) { this.type = init.type; this.sdp = init.sdp ?? ''; }
  toJSON(): RTCSessionDescriptionInit { return { type: this.type, sdp: this.sdp }; }
}

/** A candidate; its fields are read from the candidate line ("candidate:1 1 UDP 2122317823 192.168.1.2 51234 typ host"). */
export class RTCIceCandidate {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
  readonly usernameFragment: string | null;
  readonly foundation: string = '';
  readonly component: string = '';
  readonly priority: number = 0;
  readonly address: string = '';
  readonly protocol: string = '';
  readonly port: number = 0;
  /** 'host', 'srflx' (seen by a STUN server), 'prflx' or 'relay' (TURN). */
  readonly type: string = '';
  constructor(init: RTCIceCandidateInit = {}) {
    const c = init.candidate ?? '';
    this.candidate = c.startsWith('a=') ? c.substring(2) : c;
    this.sdpMid = init.sdpMid ?? null;
    this.sdpMLineIndex = init.sdpMLineIndex ?? null;
    this.usernameFragment = init.usernameFragment ?? null;
    const f = this.candidate.split(' ');
    if (f.length >= 8 && f[0].startsWith('candidate:')) {
      this.foundation = f[0].substring(10); this.component = f[1] === '1' ? 'rtp' : 'rtcp'; this.protocol = f[2].toLowerCase();
      this.priority = parseInt(f[3]); this.address = f[4]; this.port = parseInt(f[5]); this.type = f[7];
    }
  }
  toJSON(): RTCIceCandidateInit { return { candidate: this.candidate, sdpMid: this.sdpMid, sdpMLineIndex: this.sdpMLineIndex, usernameFragment: this.usernameFragment }; }
}

export class RTCPeerConnectionIceEvent extends Event {
  /** null once gathering is complete (the end-of-candidates event). */
  readonly candidate: RTCIceCandidate | null;
  constructor(type: string, candidate: RTCIceCandidate | null) { super(type); this.candidate = candidate; }
}
export class RTCDataChannelEvent extends Event {
  readonly channel: RTCDataChannel;
  constructor(type: string, channel: RTCDataChannel) { super(type); this.channel = channel; }
}

// ---------------------------------------------------------------- media

/** A codec: mimeType 'video/VP8', 'video/H264', 'audio/opus'. */
export interface RTCRtpCodec { mimeType: string; clockRate: number; channels?: number; sdpFmtpLine?: string }
export interface RTCRtpCapabilities { codecs: RTCRtpCodec[]; headerExtensions: string[] }
/** One encoding. maxBitrate in bit/s; scaleResolutionDownBy 2 sends half the width and height; rid names it when a video sender has two
 *  (simulcast, for a media server: the second one smaller, 100 kbit/s by default); scalabilityMode 'L1T2' sends VP8 in two temporal
 *  layers (the default with simulcast), 'L1T1' in one. */
export interface RTCRtpEncodingParameters {
  active?: boolean; maxBitrate?: number; maxFramerate?: number; scaleResolutionDownBy?: number; rid?: string; scalabilityMode?: string
}
export interface RTCRtpSendParameters { transactionId: string; encodings: RTCRtpEncodingParameters[]; codecs: RTCRtpCodec[] }
export interface RTCRtpReceiveParameters { codecs: RTCRtpCodec[] }
/** direction 'sendrecv' (the default), 'sendonly', 'recvonly', 'inactive'; streams: the streams the track belongs to at the peer. */
export interface RTCRtpTransceiverInit { direction?: string; streams?: MediaStream[]; sendEncodings?: RTCRtpEncodingParameters[] }

// A sender's encodings to the plugin: the first as the stream the ladder sizes, the second as the simulcast one.
function setEncodings(id: i32, e: RTCRtpEncodingParameters[]): void {
  for (const x of e) {
    if ((x.scaleResolutionDownBy ?? 1) < 1) throw new RangeError('scaleResolutionDownBy must be 1 or more.');
    const m = x.scalabilityMode ?? '';
    if (m !== '' && m !== 'L1T1' && m !== 'L1T2') throw new RangeError(`scalabilityMode '${m}' is not one this sender has ('L1T1', 'L1T2').`);
  }
  const a = e[0];
  S.setEncoding(id, a.maxBitrate ?? 0, a.maxFramerate ?? 0, a.scaleResolutionDownBy ?? 1, a.active ?? true);
  const two = e.length === 2, mode = a.scalabilityMode ?? (two ? 'L1T2' : 'L1T1');
  const b = two ? e[1] : a;
  S.setSimulcast(id, two ? (a.rid ?? '') + ',' + (b.rid ?? '') : '', mode === 'L1T2' ? 2 : 1, two ? b.maxBitrate ?? 0 : 0, two ? b.maxFramerate ?? 0 : 0,
    two ? b.scaleResolutionDownBy ?? 2 : 2, two ? b.active ?? true : true);
}

function capabilities(kind: string): RTCRtpCapabilities | null {
  if (kind !== 'audio' && kind !== 'video') return null;
  const codecs: RTCRtpCodec[] = [];
  for (const r of S.capabilities(kind).split(RS)) {
    if (r === '') continue;
    const f = r.split(FS);
    const c: RTCRtpCodec = { mimeType: f[0], clockRate: parseInt(f[1]) };
    if (parseInt(f[2]) > 0) c.channels = parseInt(f[2]);
    if (f[3] !== '') c.sdpFmtpLine = f[3];
    codecs.push(c);
  }
  return { codecs: codecs, headerExtensions: [] };
}
function codecOf(mimeType: string): RTCRtpCodec[] {
  if (mimeType === '') return [];
  const kind = mimeType.substring(0, mimeType.indexOf('/'));
  const all = capabilities(kind);
  if (all !== null) for (const c of (all as RTCRtpCapabilities).codecs) if (c.mimeType.toLowerCase() === mimeType.toLowerCase()) return [c];
  return [];
}

/** The peer's video, behind a remote video track's `camera` (the same reading as a zinc:camera Camera): the newest frame in a runtime
 *  image (<Image source={video.image}>, gfx.drawImage), its size, RGBA snapshots, a handler per frame. */
export class RemoteVideo {
  private tx: i32;
  private last: i32 = -1;
  private cbs: ((index: number) => void)[] = [];
  private ended: boolean = false;
  readonly settings: MediaTrackSettings;
  constructor(tx: i32, settings: MediaTrackSettings) { this.tx = tx; this.settings = settings; }
  /** The runtime image with the newest frame, -1 before the first one or once ended. */
  get image(): number { return this.ended ? -1 : S.remoteImage(this.tx); }
  /** Index of the newest frame (0, 1, 2...), -1 before the first. */
  get frameIndex(): number { return this.last; }
  get width(): number { return this.settings.width; }
  get height(): number { return this.settings.height; }
  get isOpen(): boolean { return !this.ended; }
  /** Called for each new frame, with its index, once the image shows it. */
  onFrame(cb: (index: number) => void): void { this.cbs.push(cb); }
  /** The newest frame as RGBA bytes (width * height * 4). */
  snapshot(): u8[] { return this.ended ? [] : S.remoteSnapshot(this.tx); }
  poll(): void {
    if (this.ended) return;
    const i = S.remoteFrame(this.tx);
    if (i < 0 || i === this.last) return;
    this.last = i;
    const sz = S.remoteSize(this.tx);
    this.settings.width = sz[0]; this.settings.height = sz[1];
    for (const cb of this.cbs.slice()) { try { cb(i); } catch (e) { reportError(e); } }
  }
  close(): void { this.ended = true; this.cbs = []; }
}

/** The peer's audio, behind a remote audio track's `microphone` (the same reading as a zinc:microphone Microphone): blocks of samples
 *  (48 kHz, mono) and a level for a meter. To hear it, give the blocks to zinc:audio (audio.stream(1, 48000).write(samples)). */
export class RemoteAudio {
  readonly sampleRate: number = 48000;
  readonly channels: number = 1;
  private tx: i32;
  private lvl: number = 0;
  private frames: number = 0;
  private cbs: ((samples: number[], frameIndex: number) => void)[] = [];
  private ended: boolean = false;
  constructor(tx: i32) { this.tx = tx; }
  /** Each block of samples as it is decoded (about every 20 ms), -1..1, with the index of its first sample. */
  onData(cb: (samples: number[], frameIndex: number) => void): void { this.cbs.push(cb); }
  /** Loudness of the last block: its RMS, 0 to 1. */
  level(): number { return this.lvl; }
  get frameIndex(): number { return this.frames; }
  get isOpen(): boolean { return !this.ended; }
  poll(track: MediaStreamTrack): void {
    if (this.ended) return;
    const s = S.remoteAudio(this.tx);
    if (s.length === 0) return;
    let sum = 0;
    for (const v of s) sum += v * v;
    this.lvl = Math.min(1, Math.sqrt(sum / s.length));
    const first = this.frames;
    this.frames += s.length;
    for (const cb of this.cbs.slice()) { try { cb(s, first); } catch (e) { reportError(e); } }
    track.feed(s, 48000, 1);
  }
  close(): void { this.ended = true; this.cbs = []; }
}

/** What a transceiver sends: its track (null: nothing), the encoding parameters, its counters. */
export class RTCRtpSender {
  track: MediaStreamTrack | null = null;
  readonly owner: RTCRtpTransceiver;
  encs: RTCRtpEncodingParameters[] = [{ active: true }];
  private lastFrame: number = -1;
  private unsub: (() => void) | null = null;
  streamIds: string[] = [];
  constructor(owner: RTCRtpTransceiver) { this.owner = owner; }
  /** The codecs this build sends for a kind ('audio', 'video'), in the default order; null for another kind. */
  static getCapabilities(kind: string): RTCRtpCapabilities | null { return capabilities(kind); }
  /** Sends another track (or none) without a new negotiation: a camera picked from a list, a microphone muted at the source.
   *  @throws TypeError for a track of the other kind; DOMException InvalidStateError once the transceiver stopped. */
  async replaceTrack(t: MediaStreamTrack | null): Promise<void> {
    if (this.owner.stopped) throw new DOMException('replaceTrack: the transceiver is stopped.', 'InvalidStateError');
    if (t !== null && (t as MediaStreamTrack).kind !== this.owner.kind) throw new TypeError(`replaceTrack: a ${(t as MediaStreamTrack).kind} track on a ${this.owner.kind} sender.`);
    this.attach(t);
  }
  /** Which streams the track belongs to at the peer (the msid of the next negotiation). */
  setStreams(...streams: MediaStream[]): void {
    this.streamIds = streams.map((m: MediaStream) => m.id);
    this.native();
  }
  getParameters(): RTCRtpSendParameters {
    return { transactionId: crypto.randomUUID(), encodings: this.encs.slice(), codecs: codecOf(this.owner.sendCodec) };
  }
  /** Changes maxBitrate, maxFramerate, scaleResolutionDownBy, active and scalabilityMode of the encodings (no negotiation).
   *  @throws DOMException InvalidModificationError for another number of encodings or other rids. */
  async setParameters(p: RTCRtpSendParameters): Promise<void> {
    const e = p.encodings;
    if (e.length !== this.encs.length) throw new DOMException(`setParameters: this sender has ${this.encs.length} encoding(s), set at addTransceiver.`, 'InvalidModificationError');
    for (let i = 0; i < e.length; i++) if ((e[i].rid ?? '') !== (this.encs[i].rid ?? '')) throw new DOMException('setParameters: the rids cannot change.', 'InvalidModificationError');
    setEncodings(this.owner.id, e);
    this.encs = e.slice();
  }
  /** The outbound-rtp, remote-inbound-rtp and codec stats of this sender. */
  async getStats(): Promise<Map<string, RTCStats>> {
    const out = new Map<string, RTCStats>();
    this.owner.owner.statsOf(this.owner, out, true, false);
    return out;
  }
  attach(t: MediaStreamTrack | null): void {
    const u = this.unsub;
    if (u !== null) { u(); this.unsub = null; }
    this.track = t;
    this.lastFrame = -1;
    if (t !== null && (t as MediaStreamTrack).kind === 'audio') {
      const track = t as MediaStreamTrack, tx = this.owner.id;
      this.unsub = track.onSamples((s: number[], rate: number, ch: number) => S.sendAudio(tx, s, rate, ch, track.enabled));
    }
    this.native();
  }
  native(): void {
    const t = this.track;
    S.setSender(this.owner.id, this.streamIds.join(','), t === null ? '' : (t as MediaStreamTrack).id);
  }
  // the newest frame of a video track to the encoder: the runtime image when there is one (no copy in Zinc), else an RGBA snapshot
  pump(): void {
    const t = this.track;
    if (t === null || (t as MediaStreamTrack).kind !== 'video' || (t as MediaStreamTrack).readyState !== 'live') return;
    const track = t as MediaStreamTrack;
    const i = track.frameIndex;
    if (i < 0 || i === this.lastFrame) return;
    this.lastFrame = i;
    if (!S.sendImage(this.owner.id, track.image, track.enabled)) {
      const st = track.getSettings();
      S.sendPixels(this.owner.id, track.snapshot(), st.width, st.height, track.enabled);
    }
  }
  close(): void { const u = this.unsub; if (u !== null) u(); this.unsub = null; }
}

/** What a transceiver receives: a track from the start (it gets frames once the peer sends), its codecs, its counters. */
export class RTCRtpReceiver {
  readonly track: MediaStreamTrack;
  readonly owner: RTCRtpTransceiver;
  readonly video: RemoteVideo | null;
  readonly audio: RemoteAudio | null;
  constructor(owner: RTCRtpTransceiver) {
    this.owner = owner;
    const s = new MediaTrackSettings(), isVideo = owner.kind === 'video';
    if (!isVideo) { s.sampleRate = 48000; s.channelCount = 1; }
    const v = new RemoteVideo(owner.id, s), a = new RemoteAudio(owner.id);
    this.video = isVideo ? v : null;
    this.audio = isVideo ? null : a;
    this.track = isVideo ? new MediaStreamTrack('remote video', s, v, () => v.close(), () => v.image, 'video')
                         : new MediaStreamTrack('remote audio', s, a, () => a.close(), () => -1, 'audio');
    if (isVideo) this.track.setFrames(() => v.frameIndex, () => v.snapshot());
  }
  /** The codecs this build receives for a kind, in the default order; null for another kind. */
  static getCapabilities(kind: string): RTCRtpCapabilities | null { return capabilities(kind); }
  getParameters(): RTCRtpReceiveParameters { return { codecs: codecOf(this.owner.recvCodec) }; }
  /** Zinc: asks the peer for a key frame now (an RTCP PLI), to show a clean picture after a glitch. The receiver asks by itself after a loss. */
  requestKeyFrame(): void { if (this.owner.kind === 'video') S.requestKeyframe(this.owner.id); }
  /** The inbound-rtp and codec stats of this receiver. */
  async getStats(): Promise<Map<string, RTCStats>> {
    const out = new Map<string, RTCStats>();
    this.owner.owner.statsOf(this.owner, out, false, true);
    return out;
  }
  poll(): void {
    const v = this.video, a = this.audio;
    if (v !== null) (v as RemoteVideo).poll();
    if (a !== null) (a as RemoteAudio).poll(this.track);
  }
}

/** One media section: a sender and a receiver of one kind, a direction, the negotiated state. */
export class RTCRtpTransceiver {
  readonly id: i32;
  readonly kind: string;
  readonly owner: RTCPeerConnection;
  readonly sender: RTCRtpSender;
  readonly receiver: RTCRtpReceiver;
  /** The media section's id once a description holds it, null before. */
  mid: string | null = null;
  /** The direction the last negotiation agreed on, null before one; 'stopped' once stopped. */
  currentDirection: string | null = null;
  stopped: boolean = false;
  /** Once a negotiation made it send: addTrack does not take it again. */
  sentBefore: boolean = false;
  sendCodec: string = '';
  recvCodec: string = '';
  private dir: string;
  constructor(id: i32, kind: string, direction: string, owner: RTCPeerConnection) {
    this.id = id; this.kind = kind; this.dir = direction; this.owner = owner;
    this.sender = new RTCRtpSender(this);
    this.receiver = new RTCRtpReceiver(this);
  }
  /** 'sendrecv', 'sendonly', 'recvonly', 'inactive' ('stopped' once stopped); a change calls for a negotiation. */
  get direction(): string { return this.stopped ? 'stopped' : this.dir; }
  set direction(d: string) {
    if (d !== 'sendrecv' && d !== 'sendonly' && d !== 'recvonly' && d !== 'inactive') throw new TypeError(`'${d}' is not a direction.`);
    if (this.stopped) throw new DOMException('The transceiver is stopped.', 'InvalidStateError');
    if (d === this.dir) return;
    this.dir = d;
    S.setDirection(this.id, d);
    this.owner.needNegotiation();
  }
  /** Stops sending and receiving for good: the receiver's track ends; the next negotiation removes the section. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.currentDirection = 'stopped';
    S.stopTransceiver(this.id);
    this.sender.close();
    this.receiver.track.stop();
    this.owner.needNegotiation();
  }
  /** The codecs of the next negotiation, in order (from RTCRtpReceiver.getCapabilities); [] for the default order.
   *  @throws DOMException InvalidModificationError for a codec this build lacks. */
  setCodecPreferences(codecs: RTCRtpCodec[]): void {
    if (!S.setCodecPreferences(this.id, codecs.map((c: RTCRtpCodec) => c.mimeType).join(','))) throw fail('InvalidModificationError');
  }
  update(f: string[]): void {
    this.mid = f[1];
    if (!this.stopped) this.currentDirection = f[4] === '' ? null : f[4] === 'stopped' ? 'stopped' : f[4];
    if (f[3] === 'stopped' && !this.stopped) { this.stopped = true; this.currentDirection = 'stopped'; this.sender.close(); this.receiver.track.stop(); }
    this.sendCodec = f[8]; this.recvCodec = f[9];
    if (f[4] === 'sendrecv' || f[4] === 'sendonly') this.sentBefore = true;
  }
  setDirectionQuietly(d: string): void { this.dir = d; S.setDirection(this.id, d); }
}

export class RTCTrackEvent extends Event {
  readonly track: MediaStreamTrack;
  readonly streams: MediaStream[];
  readonly receiver: RTCRtpReceiver;
  readonly transceiver: RTCRtpTransceiver;
  constructor(type: string, t: RTCRtpTransceiver, streams: MediaStream[]) {
    super(type);
    this.transceiver = t; this.receiver = t.receiver; this.track = t.receiver.track; this.streams = streams;
  }
}

// The live objects by native id, and the timer that takes the native queue while there are some.
const pcs = new Map<number, RTCPeerConnection>();
const channels = new Map<number, RTCDataChannel>();
let pump: i32 = -1;
function watch(): void {
  if (pump < 0 && pcs.size + channels.size > 0) pump = setInterval(drain, 5);
}
function drain(): void {
  for (;;) {
    const r = S.next();
    if (r === '') break;
    try { dispatch(r); } catch (e) { reportError(e); }
  }
  pcs.forEach((pc: RTCPeerConnection) => { try { pc.pump(); } catch (e) { reportError(e); } });
  if (pcs.size + channels.size === 0 && pump >= 0) { clearInterval(pump); pump = -1; }
}
// the n-th field (0: the kind) and everything after it, for the last field that may hold separators
function rest(r: string, n: i32): string {
  let at = 0;
  for (let i = 0; i < n; i++) { const k = r.indexOf(FS, at); if (k < 0) return ''; at = k + 1; }
  return r.substring(at);
}
function dispatch(r: string): void {
  const f = r.split(FS), kind = f[0], id = parseInt(f[1]);
  if (kind === 'text' || kind === 'binary' || kind === 'open' || kind === 'close' || kind === 'error' || kind === 'low') {
    const dc = channels.get(id);
    if (dc === undefined) return;
    if (kind === 'text') dc.message(rest(r, 2));
    else if (kind === 'binary') dc.binary(S.bytes());
    else if (kind === 'open') dc.opened();
    else if (kind === 'close') dc.closed();
    else if (kind === 'error') dc.failed(rest(r, 2));
    else dc.fire(new Event('bufferedamountlow'), dc.onbufferedamountlow);
    return;
  }
  const pc = pcs.get(id);
  if (pc === undefined) return;
  if (kind === 'cand') pc.candidate(f[2], rest(r, 3));
  else if (kind === 'state') pc.setConnection(CONNECTION[parseInt(f[2])]);
  else if (kind === 'ice') pc.setIce(ICE[parseInt(f[2])]);
  else if (kind === 'gather') pc.setGathering(GATHERING[parseInt(f[2])]);
  else if (kind === 'signal') pc.setSignaling(SIGNALING[parseInt(f[2])]);
  else if (kind === 'channel') pc.incoming(parseInt(f[2]));
}
function fail(name: string): DOMException { return new DOMException(S.error(), name); }

export class RTCDataChannel extends EventTarget {
  readonly label: string;
  readonly ordered: boolean;
  readonly maxPacketLifeTime: number | null;
  readonly maxRetransmits: number | null;
  readonly protocol: string;
  readonly negotiated: boolean;
  /** The SCTP stream id. */
  readonly id: number | null;
  /** 'connecting', 'open', 'closing', 'closed'. */
  readyState: string;
  /** 'arraybuffer' (the default): binary messages are u8[] (a Uint8Array on QuickJS); 'blob': a Blob. */
  binaryType: string = 'arraybuffer';
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onclosing: ((e: Event) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onbufferedamountlow: ((e: Event) => void) | null = null;
  private h: i32;
  private low: number = 0;
  readonly owner: RTCPeerConnection;
  constructor(h: i32, owner: RTCPeerConnection, negotiated: boolean, state: string) {
    super();
    const f = S.channelInfo(h).split(FS);
    this.h = h; this.owner = owner; this.negotiated = negotiated; this.readyState = state;
    this.label = f[0]; this.protocol = f[1];
    const stream = parseInt(f[2]), mr = parseInt(f[4]), ml = parseInt(f[5]);
    this.id = stream >= 0 && stream < 65535 ? stream : null;
    this.ordered = f[3] === '1';
    this.maxRetransmits = mr >= 0 ? mr : null;
    this.maxPacketLifeTime = ml >= 0 ? ml : null;
    channels.set(h, this);
    watch();
  }
  /** Bytes queued and not sent yet. */
  get bufferedAmount(): number { return this.readyState === 'closed' ? 0 : S.bufferedAmount(this.h); }
  /** bufferedamountlow fires when bufferedAmount falls to this many bytes (0 by default). */
  get bufferedAmountLowThreshold(): number { return this.low; }
  set bufferedAmountLowThreshold(n: number) { this.low = n; S.setBufferedAmountLowThreshold(this.h, n); }
  /** The largest message the peer takes (256 KiB between two Zinc peers). */
  get maxMessageSize(): number { return S.maxMessageSize(this.h); }
  /** Sends a string (a text message), a u8[] (a Uint8Array or an ArrayBuffer on QuickJS) or a Blob (binary messages).
   *  @throws DOMException InvalidStateError unless open; TypeError when larger than maxMessageSize. */
  send(data: unknown): void {
    if (this.readyState !== 'open') throw new DOMException(`The channel '${this.label}' is ${this.readyState}.`, 'InvalidStateError');
    let ok = false;
    if (typeof data === 'string') ok = S.sendText(this.h, data as string);
    else {
      const bytes: u8[] = data instanceof Blob ? (data as Blob).data : data as u8[];
      if (bytes.length > this.maxMessageSize) throw new TypeError(`The message (${bytes.length} bytes) is larger than maxMessageSize (${this.maxMessageSize}).`);
      ok = S.sendBytes(this.h, bytes);
    }
    if (!ok) throw fail('OperationError');
  }
  /** Closes the channel on both sides: closing now, then close here and at the peer. */
  close(): void {
    if (this.readyState === 'closing' || this.readyState === 'closed') return;
    this.readyState = 'closing';
    S.closeChannel(this.h);
  }
  fire(e: Event, h: ((e: Event) => void) | null): void {
    if (h !== null) { try { h(e); } catch (x) { reportError(x); } }
    this.dispatchEvent(e);
  }
  opened(): void {
    if (this.readyState !== 'connecting') return;
    this.readyState = 'open';
    this.fire(new Event('open'), this.onopen);
  }
  message(text: string): void { this.deliver(new MessageEvent('message', { data: text })); }
  binary(b: u8[]): void { this.deliver(new MessageEvent('message', { data: this.binaryType === 'blob' ? Blob.fromBytes(b) : b })); }
  private deliver(e: MessageEvent): void {
    if (this.readyState === 'closed') return;
    const h = this.onmessage;
    if (h !== null) { try { h(e); } catch (x) { reportError(x); } }
    this.dispatchEvent(e);
  }
  failed(text: string): void {
    const e = new ErrorEvent('error', { message: text, error: new DOMException(text, 'OperationError') });
    const h = this.onerror;
    if (h !== null) { try { h(e); } catch (x) { reportError(x); } }
    this.dispatchEvent(e);
  }
  closed(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    channels.delete(this.h);
    this.owner.closedChannels++;
    this.fire(new Event('close'), this.onclose);
    // no event after close: handlers that capture this channel must not keep it alive
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onclosing = null; this.onerror = null; this.onbufferedamountlow = null;
    this.clearListeners();
  }
}

export class RTCPeerConnection extends EventTarget {
  connectionState: string = 'new';
  iceConnectionState: string = 'new';
  iceGatheringState: string = 'new';
  signalingState: string = 'stable';
  readonly canTrickleIceCandidates: boolean = true;
  onicecandidate: ((e: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: ((e: Event) => void) | null = null;
  oniceconnectionstatechange: ((e: Event) => void) | null = null;
  onicegatheringstatechange: ((e: Event) => void) | null = null;
  onsignalingstatechange: ((e: Event) => void) | null = null;
  ondatachannel: ((e: RTCDataChannelEvent) => void) | null = null;
  onnegotiationneeded: ((e: Event) => void) | null = null;
  /** A track of the peer: when a negotiation makes a transceiver receive (the peer added a track). */
  ontrack: ((e: RTCTrackEvent) => void) | null = null;
  openedChannels: number = 0;
  closedChannels: number = 0;
  private h: i32;
  private asked: boolean = false;
  private txs: RTCRtpTransceiver[] = [];
  private streams = new Map<string, MediaStream>();   // the peer's streams by id
  private changes: number = 0;     // changes that call for a negotiation, counted
  private offered: number = 0;     // ... up to the last createOffer
  private announced: number = 0;   // ... up to the last negotiationneeded

  /** @throws DOMException SyntaxError for an ICE server URL libdatachannel cannot read; NotAllowedError when zinc.json "permissions" lack
   *  "net" (or "net:*": a peer can be any host, and the connection listens). */
  constructor(config: RTCConfiguration = {}) {
    super();
    let servers = '';
    for (const s of config.iceServers ?? []) {
      const urls: string[] = typeof s.urls === 'string' ? [s.urls as string] : s.urls as string[];
      for (const u of urls) {
        let url = u;
        if ((u.startsWith('turn:') || u.startsWith('turns:')) && s.username !== undefined) {   // libdatachannel takes the credentials in the URL
          const k = u.indexOf(':') + 1;
          url = u.substring(0, k) + encodeURIComponent(s.username ?? '') + ':' + encodeURIComponent(s.credential ?? '') + '@' + u.substring(k);
        }
        servers += url + '\n';
      }
    }
    this.h = S.create(servers, config.iceTransportPolicy === 'relay');
    if (this.h < 0) throw fail(S.error().indexOf('permission') >= 0 ? 'NotAllowedError' : 'SyntaxError');
    pcs.set(this.h, this);
    watch();
  }
  get localDescription(): RTCSessionDescription | null { return description(S.localDescription(this.h)); }
  get remoteDescription(): RTCSessionDescription | null { return description(S.remoteDescription(this.h)); }
  get currentLocalDescription(): RTCSessionDescription | null { return this.localDescription; }
  get currentRemoteDescription(): RTCSessionDescription | null { return this.remoteDescription; }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.open('createOffer');
    this.offered = this.changes;
    const sdp = S.createOffer(this.h);
    if (sdp === '') throw fail('OperationError');
    return { type: 'offer', sdp: sdp };
  }
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    this.open('createAnswer');
    if (this.signalingState !== 'have-remote-offer' && this.signalingState !== 'have-local-pranswer')
      throw new DOMException(`createAnswer needs a remote offer (signalingState is ${this.signalingState}).`, 'InvalidStateError');
    const sdp = S.createAnswer(this.h);
    if (sdp === '') throw fail('OperationError');
    // the answer holds the changes when every transceiver has a section in the offer (a new one waits for an offer of ours)
    const rd = this.remoteDescription, offer = rd === null ? '' : (rd as RTCSessionDescription).sdp;
    if (this.txs.every((t: RTCRtpTransceiver) => t.mid !== null && offer.indexOf('a=mid:' + (t.mid ?? '') + '\r') >= 0)) this.offered = this.changes;
    return { type: 'answer', sdp: sdp };
  }
  /** Applies the description createOffer / createAnswer made, or the one the state calls for when there is none; gathering starts.
   *  libdatachannel writes the description again: what an edited sdp changes in a media section is taken (the codecs kept and their
   *  order, the direction, a b=AS or b=TIAS bandwidth), the rest is not. */
  async setLocalDescription(desc: RTCSessionDescriptionInit | null = null): Promise<void> {
    this.open('setLocalDescription');
    if (!S.setLocalDescription(this.h, desc === null ? '' : desc.type, desc === null ? '' : desc.sdp ?? '')) throw fail('InvalidStateError');
    const d = this.localDescription;
    this.setSignaling(d === null ? this.signalingState : d.type === 'offer' ? 'have-local-offer' : d.type === 'pranswer' ? 'have-local-pranswer' : 'stable');
    this.sync();
  }
  /** @throws DOMException OperationError for a description that cannot be read or applied. */
  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.open('setRemoteDescription');
    if (desc.type !== 'offer' && desc.type !== 'answer' && desc.type !== 'pranswer') throw new TypeError(`'${desc.type}' is not a description type this engine takes (offer, answer, pranswer).`);
    if (!S.setRemoteDescription(this.h, desc.sdp ?? '', desc.type)) throw fail('OperationError');
    this.setSignaling(desc.type === 'offer' ? 'have-remote-offer' : desc.type === 'pranswer' ? 'have-remote-pranswer' : 'stable');
    this.sync();
  }

  // ---- media
  /** Sends a track to the peer (a camera's or a microphone's from getUserMedia, or a track received from another peer), in `streams`. A
   *  transceiver of its kind that the peer's offer made and that sends nothing yet takes it; else a new one (sendrecv).
   *  @throws DOMException InvalidAccessError when the track is already sent; InvalidStateError once closed. */
  addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
    this.open('addTrack');
    for (const t of this.txs) if (t.sender.track === track && !t.stopped) throw new DOMException('addTrack: the track is already sent.', 'InvalidAccessError');
    for (const t of this.txs) {
      if (t.stopped || t.kind !== track.kind || t.sender.track !== null || t.sentBefore) continue;
      t.sender.streamIds = streams.map((m: MediaStream) => m.id);
      t.sender.attach(track);
      if (t.direction === 'recvonly') t.setDirectionQuietly('sendrecv');
      else if (t.direction === 'inactive') t.setDirectionQuietly('sendonly');
      this.needNegotiation();
      return t.sender;
    }
    return this.addTransceiver(track, { direction: 'sendrecv', streams: streams }).sender;
  }
  /** Stops sending the sender's track (its transceiver keeps receiving); a new negotiation tells the peer. */
  removeTrack(sender: RTCRtpSender): void {
    this.open('removeTrack');
    const t = sender.owner;
    if (t.owner !== this) throw new DOMException('removeTrack: the sender is not one of this connection.', 'InvalidAccessError');
    if (sender.track === null || t.stopped) return;
    sender.attach(null);
    if (t.direction === 'sendrecv') t.setDirectionQuietly('recvonly');
    else if (t.direction === 'sendonly') t.setDirectionQuietly('inactive');
    this.needNegotiation();
  }
  /** A new media section of a kind ('audio', 'video') or for a track. init: direction ('sendrecv' by default), streams, sendEncodings (one,
   *  or two with rids for video: simulcast, sent when the peer's answer takes it, as a media server's does). @throws TypeError for another
   *  kind; RangeError for more encodings, or two without distinct rids. */
  addTransceiver(trackOrKind: unknown, init: RTCRtpTransceiverInit = {}): RTCRtpTransceiver {
    this.open('addTransceiver');
    const track: MediaStreamTrack | null = typeof trackOrKind === 'string' ? null : trackOrKind as MediaStreamTrack;
    const kind = track !== null ? (track as MediaStreamTrack).kind : trackOrKind as string;
    if (kind !== 'audio' && kind !== 'video') throw new TypeError(`addTransceiver: '${kind}' is not a kind ('audio' or 'video').`);
    const enc = init.sendEncodings ?? [];
    if (enc.length > 2 || (enc.length === 2 && kind !== 'video')) throw new RangeError('addTransceiver: one encoding, or two for video (simulcast).');
    if (enc.length === 2 && ((enc[0].rid ?? '') === '' || (enc[1].rid ?? '') === '' || enc[0].rid === enc[1].rid))
      throw new RangeError('addTransceiver: the two encodings of simulcast need two different rids.');
    const dir = init.direction ?? 'sendrecv';
    const id = S.addTransceiver(this.h, kind, dir);
    if (id < 0) throw fail('OperationError');
    const t = new RTCRtpTransceiver(id, kind, dir, this);
    this.txs.push(t);
    t.sender.streamIds = (init.streams ?? []).map((m: MediaStream) => m.id);
    if (enc.length > 0) { setEncodings(id, enc); t.sender.encs = enc.slice(); }
    t.sender.attach(track);
    this.needNegotiation();
    return t;
  }
  getTransceivers(): RTCRtpTransceiver[] { return this.txs.slice(); }
  getSenders(): RTCRtpSender[] { return this.txs.filter((t: RTCRtpTransceiver) => !t.stopped).map((t: RTCRtpTransceiver) => t.sender); }
  getReceivers(): RTCRtpReceiver[] { return this.txs.filter((t: RTCRtpTransceiver) => !t.stopped).map((t: RTCRtpTransceiver) => t.receiver); }

  /** negotiationneeded, once for the changes made in one turn, when the connection is stable (else when it is again), unless an offer
   *  made since holds them. */
  needNegotiation(): void {
    this.changes++;
    setTimeout(() => this.checkNegotiation(), 0);
  }
  private checkNegotiation(): void {
    if (this.signalingState !== 'stable' || this.changes <= Math.max(this.offered, this.announced)) return;
    this.announced = this.changes;
    this.fire(new Event('negotiationneeded'), this.onnegotiationneeded);
  }
  // The transceivers as the native side has them now: new ones of a remote offer, mids, negotiated directions and codecs; ontrack for the
  // ones the peer started sending on.
  sync(): void {
    const due: RTCRtpTransceiver[] = [], streamOf: string[] = [];
    for (const r of S.transceivers(this.h).split(RS)) {
      if (r === '') continue;
      const f = r.split(FS), id = parseInt(f[0]);
      let t: RTCRtpTransceiver | null = null;
      for (const x of this.txs) if (x.id === id) t = x;
      if (t === null) { t = new RTCRtpTransceiver(id, f[2], f[3], this); this.txs.push(t as RTCRtpTransceiver); }
      const tx = t as RTCRtpTransceiver;
      tx.update(f);
      if (f[5] === '1' && !tx.stopped) { due.push(tx); streamOf.push(f[6]); }
    }
    for (let i = 0; i < due.length; i++) {
      const t = due[i], streams: MediaStream[] = [];
      if (streamOf[i] !== '') {
        let m = this.streams.get(streamOf[i]);
        if (m === undefined) { m = new MediaStream([], streamOf[i]); this.streams.set(streamOf[i], m as MediaStream); }
        (m as MediaStream).addTrack(t.receiver.track);
        streams.push(m as MediaStream);
      }
      const e = new RTCTrackEvent('track', t, streams);
      const h = this.ontrack;
      if (h !== null) { try { h(e); } catch (x) { reportError(x); } }
      this.dispatchEvent(e);
    }
  }
  pump(): void {
    for (const t of this.txs) {
      if (t.stopped) continue;
      t.sender.pump();
      t.receiver.poll();
    }
  }
  // the stats of one transceiver: outbound-rtp and remote-inbound-rtp (what it sends), inbound-rtp (what it receives), their codecs
  statsOf(t: RTCRtpTransceiver, out: Map<string, RTCStats>, sent: boolean, received: boolean): void {
    const v = new Map<string, string>();
    for (const kv of S.txStats(t.id).split(FS)) { const k = kv.indexOf('='); if (k > 0) v.set(kv.substring(0, k), kv.substring(k + 1)); }
    const n = (k: string): number => { const x = v.get(k); return x === undefined ? 0 : parseFloat(x as string); };
    const s = (k: string): string => { const x = v.get(k); return x === undefined ? '' : x as string; };
    const mid = t.mid ?? '';
    const codec = (mime: string, pt: string, clock: string, fmtp: string): string => {
      if (mime === '') return '';
      const c = new RTCStats('C' + mid + '_' + s(pt), 'codec');
      c.mimeType = mime; c.payloadType = n(pt); c.clockRate = n(clock); c.channels = mime === 'audio/opus' ? 2 : 0; c.sdpFmtpLine = s(fmtp);
      out.set(c.id, c);
      return c.id;
    };
    if (sent && (n('packetsSent') > 0 || t.sendCodec !== '')) {
      const o = new RTCStats('OT' + t.kind + mid, 'outbound-rtp');
      o.kind = t.kind; o.mid = mid; o.ssrc = n('ssrc'); o.bytesSent = n('bytesSent'); o.packetsSent = n('packetsSent');
      o.framesEncoded = n('framesEncoded'); o.keyFramesEncoded = n('keyFramesEncoded'); o.framesPerSecond = n('framesPerSecondSent');
      o.frameWidth = n('frameWidthSent'); o.frameHeight = n('frameHeightSent'); o.pliCount = n('pliCount'); o.totalEncodeTime = n('totalEncodeTime');
      o.targetBitrate = n('targetBitrate'); o.rembBitrate = n('rembBitrate'); o.wireBytesSent = n('wireBytesSent');
      o.nackCount = n('nackReceived'); o.qualityLimitationReason = s('qualityLimitationReason'); o.rid = s('rid');
      const tr = t.sender.track;
      if (tr !== null) o.trackIdentifier = (tr as MediaStreamTrack).id;
      o.codecId = codec(t.sendCodec, 'sendPayloadType', 'sendClockRate', 'sendFmtp');
      const r = new RTCStats('RI' + t.kind + mid, 'remote-inbound-rtp');
      r.kind = t.kind; r.mid = mid; r.ssrc = o.ssrc; r.localId = o.id; r.codecId = o.codecId;
      r.roundTripTime = Math.max(0, n('roundTripTime')); r.fractionLost = n('fractionLost'); r.packetsLost = n('remotePacketsLost'); r.jitter = n('remoteJitter');
      o.remoteId = r.id;
      out.set(o.id, o); out.set(r.id, r);
      if (s('lowRid') !== '') {   // the simulcast stream
        const l = new RTCStats(o.id + '_' + s('lowRid'), 'outbound-rtp');
        l.kind = t.kind; l.mid = mid; l.rid = s('lowRid'); l.ssrc = n('lowSsrc'); l.codecId = o.codecId; l.trackIdentifier = o.trackIdentifier;
        l.bytesSent = n('lowBytesSent'); l.packetsSent = n('lowPacketsSent'); l.framesEncoded = n('lowFramesEncoded'); l.keyFramesEncoded = n('lowKeyFramesEncoded');
        l.totalEncodeTime = n('lowTotalEncodeTime'); l.targetBitrate = n('lowTargetBitrate'); l.framesPerSecond = n('lowFramesPerSecond');
        l.frameWidth = n('lowFrameWidth'); l.frameHeight = n('lowFrameHeight');
        out.set(l.id, l);
      }
    }
    if (received && (n('packetsReceived') > 0 || t.recvCodec !== '')) {
      const i = new RTCStats('IT' + t.kind + mid, 'inbound-rtp');
      i.kind = t.kind; i.mid = mid; i.bytesReceived = n('bytesReceived'); i.packetsReceived = n('packetsReceived'); i.packetsLost = n('packetsLost');
      i.jitter = n('jitter'); i.framesDecoded = n('framesDecoded'); i.keyFramesDecoded = n('keyFramesDecoded'); i.framesPerSecond = n('framesPerSecond');
      i.frameWidth = n('frameWidth'); i.frameHeight = n('frameHeight'); i.totalSamplesReceived = n('totalSamplesReceived');
      i.concealedSamples = n('concealedSamples'); i.fecPacketsReceived = n('fecPacketsReceived'); i.fecSamples = n('fecSamples'); i.dredSamples = n('dredSamples');
      i.jitterBufferDelay = n('jitterBufferDelay'); i.jitterBufferTargetDelay = n('jitterBufferTargetDelay'); i.jitterBufferEmittedCount = n('jitterBufferEmittedCount');
      i.insertedSamplesForDeceleration = n('insertedSamplesForDeceleration'); i.removedSamplesForAcceleration = n('removedSamplesForAcceleration');
      i.totalMouthToEarDelay = n('totalMouthToEarDelay'); i.mouthToEarCount = n('mouthToEarCount'); i.framesDropped = n('framesDropped'); i.pliCount = n('pliSent'); i.trackIdentifier = t.receiver.track.id;
      i.nackCount = n('nackSent');
      i.codecId = codec(t.recvCodec, 'recvPayloadType', 'recvClockRate', 'recvFmtp');
      out.set(i.id, i);
    }
  }
  /** A candidate of the peer (its onicecandidate); null or an empty candidate marks the end of them. */
  async addIceCandidate(c: RTCIceCandidateInit | null = null): Promise<void> {
    this.open('addIceCandidate');
    if (c === null || (c.candidate ?? '') === '') return;
    if (this.remoteDescription === null) throw new DOMException('addIceCandidate needs the remote description first.', 'InvalidStateError');
    if (!S.addIceCandidate(this.h, c.candidate ?? '', c.sdpMid ?? '')) throw fail('OperationError');
  }
  /** @throws DOMException InvalidStateError once closed; TypeError for maxRetransmits with maxPacketLifeTime, or negotiated without an id. */
  createDataChannel(label: string, init: RTCDataChannelInit = {}): RTCDataChannel {
    this.open('createDataChannel');
    if (init.maxRetransmits !== undefined && init.maxPacketLifeTime !== undefined) throw new TypeError('maxRetransmits and maxPacketLifeTime cannot both be set.');
    const negotiated = init.negotiated ?? false;
    if (negotiated && init.id === undefined) throw new TypeError('A negotiated channel needs an id.');
    const h = S.createDataChannel(this.h, label, init.protocol ?? '', init.ordered ?? true, init.maxRetransmits ?? -1, init.maxPacketLifeTime ?? -1, negotiated, init.id ?? -1);
    if (h < 0) throw fail('OperationError');
    this.openedChannels++;
    if (!this.asked) {   // the first channel calls for an offer
      this.asked = true;
      setTimeout(() => { if (this.signalingState !== 'closed') this.fire(new Event('negotiationneeded'), this.onnegotiationneeded); }, 0);
    }
    return new RTCDataChannel(h, this, negotiated, 'connecting');
  }
  async getStats(): Promise<Map<string, RTCStats>> {
    if (this.signalingState !== 'closed') this.sync();   // the receive codec is known once the first packet came
    const f = S.stats(this.h).split(FS), out = new Map<string, RTCStats>();
    const p = new RTCStats('P', 'peer-connection');
    p.dataChannelsOpened = this.openedChannels; p.dataChannelsClosed = this.closedChannels;
    const t = new RTCStats('T', 'transport');
    t.bytesSent = parseInt(f[2]); t.bytesReceived = parseInt(f[3]); t.messagesSent = parseInt(f[4]); t.messagesReceived = parseInt(f[5]);
    t.state = this.connectionState;
    const c = new RTCStats('CP', 'candidate-pair');
    c.localAddress = f[0]; c.remoteAddress = f[1]; c.state = f[0] === '' ? 'waiting' : 'succeeded';
    out.set(p.id, p); out.set(t.id, t); out.set(c.id, c);
    for (const x of this.txs) this.statsOf(x, out, true, true);
    out.forEach((r: RTCStats) => {   // the media bytes count in the transport; the round trip of the pair is the last one the peer reported
      if (r.type === 'outbound-rtp') { t.bytesSent += r.bytesSent; c.availableOutgoingBitrate += r.rembBitrate > 0 ? r.rembBitrate : r.targetBitrate; }
      else if (r.type === 'inbound-rtp') t.bytesReceived += r.bytesReceived;
      else if (r.type === 'remote-inbound-rtp' && r.roundTripTime > 0) c.currentRoundTripTime = r.roundTripTime;
    });
    return out;
  }
  /** Ends the connection: its channels close (their close events fire), the tracks of its receivers end, and no event of the connection
   *  follows. */
  close(): void {
    if (this.signalingState === 'closed') return;
    this.signalingState = 'closed'; this.connectionState = 'closed'; this.iceConnectionState = 'closed';
    pcs.delete(this.h);
    const mine: RTCDataChannel[] = [];
    channels.forEach((dc: RTCDataChannel) => { if (dc.owner === this && dc.readyState !== 'closed') mine.push(dc); });
    for (const t of this.txs) { t.stopped = true; t.currentDirection = 'stopped'; t.sender.close(); t.receiver.track.stop(); }
    S.close(this.h);
    for (const dc of mine) { dc.readyState = 'closing'; setTimeout(() => dc.closed(), 0); }
  }

  private open(what: string): void {
    if (this.signalingState === 'closed') throw new DOMException(`${what}: the connection is closed.`, 'InvalidStateError');
  }
  fire(e: Event, h: ((e: Event) => void) | null): void {
    if (h !== null) { try { h(e); } catch (x) { reportError(x); } }
    this.dispatchEvent(e);
  }
  candidate(mid: string, line: string): void {
    const e = new RTCPeerConnectionIceEvent('icecandidate', new RTCIceCandidate({ candidate: line, sdpMid: mid, sdpMLineIndex: 0 }));
    const h = this.onicecandidate;
    if (h !== null) { try { h(e); } catch (x) { reportError(x); } }
    this.dispatchEvent(e);
  }
  setConnection(s: string): void { if (s !== this.connectionState) { this.connectionState = s; this.fire(new Event('connectionstatechange'), this.onconnectionstatechange); } }
  setIce(s: string): void { if (s !== this.iceConnectionState) { this.iceConnectionState = s; this.fire(new Event('iceconnectionstatechange'), this.oniceconnectionstatechange); } }
  setSignaling(s: string): void {
    if (s === this.signalingState) return;
    this.signalingState = s;
    this.fire(new Event('signalingstatechange'), this.onsignalingstatechange);
    if (s === 'stable') setTimeout(() => this.checkNegotiation(), 0);   // what changed during the last negotiation
  }
  setGathering(s: string): void {
    if (s === this.iceGatheringState) return;
    this.iceGatheringState = s;
    this.fire(new Event('icegatheringstatechange'), this.onicegatheringstatechange);
    if (s !== 'complete') return;
    const e = new RTCPeerConnectionIceEvent('icecandidate', null);   // the end of candidates
    const h = this.onicecandidate;
    if (h !== null) { try { h(e); } catch (x) { reportError(x); } }
    this.dispatchEvent(e);
  }
  incoming(h: i32): void {
    const dc = new RTCDataChannel(h, this, false, 'open');
    this.openedChannels++;
    const e = new RTCDataChannelEvent('datachannel', dc);
    const f = this.ondatachannel;
    if (f !== null) { try { f(e); } catch (x) { reportError(x); } }
    this.dispatchEvent(e);
    if (dc.readyState === 'open') dc.fire(new Event('open'), dc.onopen);
  }
}
function description(s: string): RTCSessionDescription | null {
  if (s === '') return null;
  const k = s.indexOf(FS);
  return new RTCSessionDescription({ type: s.substring(0, k), sdp: s.substring(k + 1) });
}

/** The ultra low data mode's audio bit rate: Opus at 10 kbit/s, voice, wideband, DTX and in-band FEC (the encoder switches those on at
 *  16 kbit/s and under). */
export const LOW_DATA_AUDIO_BPS = 10000;
const saved = new Map<RTCRtpSender, RTCRtpEncodingParameters[]>();
/** The ultra low data mode for a poor connection, on or off: the audio goes out as Opus at LOW_DATA_AUDIO_BPS with DTX and FEC; the video
 *  stops ('off') or goes out at a quarter of its size, 5 frames a second and 60 kbit/s at most ('tiny'). Off puts back the encodings the
 *  senders had. It is setParameters on each sender: no new negotiation, the peer needs nothing. */
export async function setLowDataMode(pc: RTCPeerConnection, on: boolean, video: string = 'tiny'): Promise<void> {
  for (const s of pc.getSenders()) {
    const t = s.track;
    if (t === null) continue;
    const p = s.getParameters(), was = saved.get(s);
    if (!on) {
      if (was === undefined) continue;
      p.encodings = was as RTCRtpEncodingParameters[];
      saved.delete(s);
    } else {
      if (was === undefined) saved.set(s, p.encodings);
      const low: RTCRtpEncodingParameters = (t as MediaStreamTrack).kind === 'audio' ? { active: true, maxBitrate: LOW_DATA_AUDIO_BPS }
        : video === 'off' ? { active: false } : { active: true, maxBitrate: 60000, maxFramerate: 5, scaleResolutionDownBy: 4 };
      low.rid = p.encodings[0].rid;
      // simulcast: the first stream carries the tiny picture, the second stops
      p.encodings = p.encodings.map((e: RTCRtpEncodingParameters, i: number): RTCRtpEncodingParameters => i === 0 ? low : { active: false, rid: e.rid });
    }
    await s.setParameters(p);
  }
}
