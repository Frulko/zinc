// zinc:webrtc — WebRTC data channels (docs/plugins/webrtc.md): RTCPeerConnection, RTCDataChannel, RTCSessionDescription, RTCIceCandidate and
// their events, as on the Web. The native side (native/webrtc.spec.ts) is libdatachannel; its threads queue what happens and this file
// takes the queue on a timer while a connection or a channel lives, then fires the events on the program's thread.
// On the Zinc engines the names are globals (the compiler adds the import); on QuickJS import them from 'zinc:webrtc'.
// Not here yet: audio and video tracks (addTrack, ontrack), getStats beyond a few counters, restartIce, setConfiguration, certificates.
import S from './native/webrtc.spec';
import { Event, EventTarget, DOMException, MessageEvent, ErrorEvent, Blob, reportError } from 'zinc:web';

const FS = '\u001f';
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

/** A counter set of getStats(): type 'peer-connection' (dataChannelsOpened, dataChannelsClosed), 'transport' (bytes and messages of the
 *  channels), 'candidate-pair' (the addresses in use). */
export class RTCStats {
  id: string; type: string; timestamp: number;
  bytesSent: number = 0; bytesReceived: number = 0; messagesSent: number = 0; messagesReceived: number = 0;
  dataChannelsOpened: number = 0; dataChannelsClosed: number = 0;
  localAddress: string = ''; remoteAddress: string = ''; state: string = '';
  constructor(id: string, type: string) { this.id = id; this.type = type; this.timestamp = Date.now(); }
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
  openedChannels: number = 0;
  closedChannels: number = 0;
  private h: i32;
  private asked: boolean = false;

  /** @throws DOMException SyntaxError for an ICE server URL libdatachannel cannot read. */
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
    if (this.h < 0) throw fail('SyntaxError');
    pcs.set(this.h, this);
    watch();
  }
  get localDescription(): RTCSessionDescription | null { return description(S.localDescription(this.h)); }
  get remoteDescription(): RTCSessionDescription | null { return description(S.remoteDescription(this.h)); }
  get currentLocalDescription(): RTCSessionDescription | null { return this.localDescription; }
  get currentRemoteDescription(): RTCSessionDescription | null { return this.remoteDescription; }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.open('createOffer');
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
    return { type: 'answer', sdp: sdp };
  }
  /** Applies the description createOffer / createAnswer made (its sdp is not read: libdatachannel makes the same one again), or the one the
   *  state calls for when there is none; gathering starts. */
  async setLocalDescription(desc: RTCSessionDescriptionInit | null = null): Promise<void> {
    this.open('setLocalDescription');
    if (!S.setLocalDescription(this.h, desc === null ? '' : desc.type)) throw fail('InvalidStateError');
    const d = this.localDescription;
    this.setSignaling(d === null ? this.signalingState : d.type === 'offer' ? 'have-local-offer' : d.type === 'pranswer' ? 'have-local-pranswer' : 'stable');
  }
  /** @throws DOMException OperationError for a description that cannot be read or applied. */
  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.open('setRemoteDescription');
    if (desc.type !== 'offer' && desc.type !== 'answer' && desc.type !== 'pranswer') throw new TypeError(`'${desc.type}' is not a description type this engine takes (offer, answer, pranswer).`);
    if (!S.setRemoteDescription(this.h, desc.sdp ?? '', desc.type)) throw fail('OperationError');
    this.setSignaling(desc.type === 'offer' ? 'have-remote-offer' : desc.type === 'pranswer' ? 'have-remote-pranswer' : 'stable');
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
    const f = S.stats(this.h).split(FS), out = new Map<string, RTCStats>();
    const p = new RTCStats('P', 'peer-connection');
    p.dataChannelsOpened = this.openedChannels; p.dataChannelsClosed = this.closedChannels;
    const t = new RTCStats('T', 'transport');
    t.bytesSent = parseInt(f[2]); t.bytesReceived = parseInt(f[3]); t.messagesSent = parseInt(f[4]); t.messagesReceived = parseInt(f[5]);
    t.state = this.connectionState;
    const c = new RTCStats('CP', 'candidate-pair');
    c.localAddress = f[0]; c.remoteAddress = f[1]; c.state = f[0] === '' ? 'waiting' : 'succeeded';
    out.set(p.id, p); out.set(t.id, t); out.set(c.id, c);
    return out;
  }
  /** Ends the connection: its channels close (their close events fire), and no event of the connection follows. */
  close(): void {
    if (this.signalingState === 'closed') return;
    this.signalingState = 'closed'; this.connectionState = 'closed'; this.iceConnectionState = 'closed';
    pcs.delete(this.h);
    const mine: RTCDataChannel[] = [];
    channels.forEach((dc: RTCDataChannel) => { if (dc.owner === this && dc.readyState !== 'closed') mine.push(dc); });
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
  setSignaling(s: string): void { if (s !== this.signalingState) { this.signalingState = s; this.fire(new Event('signalingstatechange'), this.onsignalingstatechange); } }
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
