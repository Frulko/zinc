// Galène 1.2.1 protocol v2: one unidirectional PeerConnection per stream.
// Reference: https://github.com/jech/galene/blob/galene-1.2.1/galene-protocol.md
import { WebSocket, MessageEvent } from 'zinc:socket';
import { URL, MediaStream, MediaStreamTrack, AbortController, toHex } from 'zinc:web';
import { randomBytes } from 'zinc:sys';
import { fetch } from 'zinc:web/fetch';
import { RTCPeerConnection, RTCConfiguration, RTCIceCandidateInit, RTCTrackEvent, RemoteAudio, RTCStats } from 'zinc:webrtc';
import { stream, AudioStream } from 'zinc:audio';

export enum GaleneState { Idle, Discovering, Handshaking, Joining, Joined, Backoff, Failed, Closed }
enum StreamState { New, Negotiating, Offered, Active, Closed }
export type TileVideo = 'video' | 'video-low' | 'hidden';
export interface Invite { location: string; group: string; token: string }
interface Status { name: string; location: string; endpoint: string }
interface Message {
  type: string; kind?: string; id?: string; source?: string; username?: string; label?: string;
  sdp?: string; replace?: string; version?: string[]; group?: string; value?: string;
  permissions?: string[]; rtcConfiguration?: RTCConfiguration; candidate?: RTCIceCandidateInit | null; error?: string;
}

function localHost(url: URL): boolean { return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'; }

/** Accept the server's fragment link, Galène's group link, or the join page's app link. Never send the token in the status request. */
export function parseInvite(input: string): Invite {
  if (input.length > 8192) throw new Error('The call link is too long.');
  const parsed = URL.parse(input.trim());
  if (parsed === null) throw new Error('Enter a valid call link.');
  let url = parsed as URL;
  if (url.protocol === 'zinc-call:') url = new URL('https://' + url.host + '/group' + url.pathname + url.search);
  if (url.username !== '' || url.password !== '' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost(url))))
    throw new Error('Use an HTTPS call link (HTTP is allowed on localhost).');
  let group = '', token = '';
  if (url.pathname === '/join.html') {
    const fragment = url.hash.slice(1), slash = fragment.indexOf('/');
    if (slash >= 0) { group = decodeURIComponent(fragment.slice(0, slash)); token = decodeURIComponent(fragment.slice(slash + 1)); }
  } else if (url.pathname.startsWith('/group/')) {
    group = decodeURIComponent(url.pathname.slice(7).replace(/\/$/, ''));
    token = url.searchParams.get('token') ?? '';
  }
  if (group === '' || group.startsWith('.') || group.startsWith('/') || group.endsWith('/') || group.split('/').some((part: string) => part === '.' || part === '..' || part === '') || /[\x00-\x1f\x7f]/.test(group))
    throw new Error('The call link needs a valid group.');
  if (token === '' || /[\x00-\x20\x7f]/.test(token)) throw new Error('The call link needs an invite token.');
  return { location: url.origin + '/group/' + group.split('/').map((part: string) => encodeURIComponent(part)).join('/') + '/', group, token };
}

export class GaleneStream {
  readonly id: string;
  readonly pc: RTCPeerConnection;
  readonly up: boolean;
  label: string;
  source: string = '';
  username: string = '';
  video: MediaStreamTrack | null = null;
  audio: MediaStreamTrack | null = null;
  requested: TileVideo = 'video-low';
  videoBytes: number = 0;
  audioBytes: number = 0;
  audioSamples: number = 0;
  state: StreamState = StreamState.New;
  localIce: RTCIceCandidateInit[] = [];
  remoteIce: RTCIceCandidateInit[] = [];
  speaker: AudioStream | null = null;

  constructor(id: string, label: string, up: boolean, config: RTCConfiguration) {
    this.id = id; this.label = label; this.up = up;
    this.pc = new RTCPeerConnection(config);
  }
  transition(next: StreamState): void {
    if (next === this.state) return;
    if (this.state === StreamState.Closed || (next !== StreamState.Closed && !(
      (this.state === StreamState.New && next === StreamState.Negotiating) ||
      (this.state === StreamState.Negotiating && (next === StreamState.Offered || next === StreamState.Active)) ||
      (this.state === StreamState.Offered && next === StreamState.Active) ||
      (this.state === StreamState.Active && next === StreamState.Negotiating)))) throw new Error('Illegal Galène stream transition');
    this.state = next;
  }
  close(): void {
    if (this.state === StreamState.Closed) return;
    this.transition(StreamState.Closed);
    this.pc.onicecandidate = null; this.pc.oniceconnectionstatechange = null; this.pc.ontrack = null;
    this.pc.close();
    if (this.speaker !== null) this.speaker.close();
    this.speaker = null; this.video = null; this.audio = null;
    this.localIce = []; this.remoteIce = [];
  }
}

export class Galene {
  state: GaleneState = GaleneState.Idle;
  why: string = '';
  group: string = '';
  username: string = '';
  displayName: string = 'Zinc guest';
  users = new Map<string, string>();
  streams = new Map<string, GaleneStream>();
  speakerOn: boolean = false;
  onChange: () => void = () => {};
  private invite: Invite | null = null;
  private socket: WebSocket | null = null;
  private discovery: AbortController | null = null;
  private config: RTCConfiguration = {};
  private media = new Map<string, MediaStream>();
  private clientId: string = '';
  private generation: number = 0;
  private retry: number = 0;
  private timer: i32 = 0;
  private lastMessage: number = 0;
  private lastPing: number = 0;
  private messages: Promise<void> = Promise.resolve();

  private transition(next: GaleneState): void {
    const from = this.state;
    if (from === next) return;
    const legal = next === GaleneState.Closed || next === GaleneState.Failed ||
      (next === GaleneState.Discovering && (from === GaleneState.Idle || from === GaleneState.Closed || from === GaleneState.Failed || from === GaleneState.Backoff)) ||
      (from === GaleneState.Discovering && next === GaleneState.Handshaking) ||
      (from === GaleneState.Handshaking && next === GaleneState.Joining) ||
      (from === GaleneState.Joining && next === GaleneState.Joined) ||
      (next === GaleneState.Backoff && from !== GaleneState.Idle && from !== GaleneState.Closed && from !== GaleneState.Failed);
    if (!legal) throw new Error('Illegal Galène connection transition');
    this.state = next;
    this.onChange();
  }

  async join(link: string, camera: MediaStream | null): Promise<void> {
    this.close();
    this.why = ''; this.retry = 0;
    this.invite = parseInvite(link); this.group = this.invite.group;
    if (camera !== null) this.media.set('camera', camera);
    await this.connect();
  }

  private async connect(): Promise<void> {
    const invite = this.invite;
    if (invite === null) return;
    const generation = ++this.generation;
    this.clientId = toHex(randomBytes(16));
    this.transition(GaleneState.Discovering);
    const discovery = new AbortController();
    this.discovery = discovery;
    try {
      const response = await fetch(invite.location + '.status', { signal: discovery.signal, timeoutMs: 10000, maxBytes: 65536 });
      if (generation !== this.generation) return;
      if (!response.ok) throw new Error('The call server returned HTTP ' + response.status + '.');
      const status = await response.json() as Status;
      if (generation !== this.generation) return;
      if (status === null || typeof status.name !== 'string' || status.name !== invite.group || typeof status.endpoint !== 'string') throw new Error('Invalid group status.');
      const endpoint = new URL(status.endpoint, invite.location), location = new URL(invite.location);
      const expected = location.protocol === 'https:' ? 'wss:' : 'ws:';
      // The invite authorises this server only; an endpoint must not receive its token on a different host or a downgraded transport.
      if (endpoint.protocol !== expected || endpoint.host !== location.host || endpoint.username !== '' || endpoint.password !== '' || endpoint.search !== '' || endpoint.hash !== '') throw new Error('The call endpoint must belong to the invite server.');
      this.open(endpoint.href, generation);
    } catch (error) {
      if (generation === this.generation) this.reconnect('Cannot reach the call server.');
    } finally {
      if (this.discovery === discovery) this.discovery = null;
    }
  }

  private open(endpoint: string, generation: number): void {
    const socket = new WebSocket(endpoint);
    this.socket = socket;
    this.messages = Promise.resolve();
    this.lastMessage = Date.now(); this.lastPing = Date.now();
    this.transition(GaleneState.Handshaking);
    socket.onopen = () => { if (this.socket === socket) this.send({ type: 'handshake', version: ['2'], id: this.clientId }); };
    socket.onmessage = (event: MessageEvent) => {
      if (this.socket !== socket) return;
      this.lastMessage = Date.now();
      if (event.data.length > 1048576) { this.fail('The call server sent an oversized message.'); return; }
      this.messages = this.messages.then(async () => {
        if (generation !== this.generation) return;
        const message = JSON.parse(event.data) as Message;
        if (message === null || typeof message.type !== 'string') throw new Error('Invalid call message.');
        await this.message(message);
      }).catch((error: unknown) => { if (generation === this.generation) this.fail((error as Error).message); });
    };
    socket.onerror = () => { if (this.socket === socket) this.reconnect('The call connection was lost.'); };
    socket.onclose = () => { if (this.socket === socket) this.reconnect('The call server disconnected.'); };
    this.timer = setInterval(() => {
      if (generation !== this.generation) return;
      const now = Date.now();
      if (now - this.lastMessage > 15000) { this.reconnect('The call server stopped responding.'); return; }
      if (this.state === GaleneState.Joined && now - this.lastPing >= 10000) { this.lastPing = now; this.send({ type: 'ping' }); }
      this.measure().catch((error: unknown) => { if (generation === this.generation) this.fail('Cannot read call statistics.'); });
    }, 1000);
  }

  private send(message: unknown): void {
    const socket = this.socket;
    if (socket === null || socket.readyState !== 1) throw new Error('The call socket is not open.');
    socket.send(JSON.stringify(message));
  }

  private async message(message: Message): Promise<void> {
    const type = message.type;
    if (type === 'handshake') {
      const versions = message.version ?? [];
      if (this.state !== GaleneState.Handshaking || !Array.isArray(versions) || !versions.includes('2')) throw new Error('The call server must support protocol 2.');
      this.transition(GaleneState.Joining);
      const invite = this.invite as Invite;
      this.send({ type: 'join', kind: 'join', group: invite.group, token: invite.token });
      return;
    }
    if (this.state === GaleneState.Handshaking) throw new Error('The call server did not send a handshake.');
    if (type === 'ping') { this.send({ type: 'pong' }); return; }
    if (type === 'pong') return;
    if (type === 'joined') {
      if (message.kind === 'fail' && message.error === 'need-username' && this.state === GaleneState.Joining) {
        const invite = this.invite as Invite;
        const name = this.displayName.trim();
        if (name === '' || name.length > 128 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Enter a name of 1–128 characters.');
        // The pinned server requires a name only for unbound tokens; bound invites choose their own name.
        this.send({ type: 'join', kind: 'join', group: invite.group, token: invite.token, username: name });
        return;
      }
      if (message.kind === 'fail' || message.kind === 'leave') { this.fail(message.value ?? 'The invite was refused or the group was left.'); return; }
      if (message.kind !== 'join' && message.kind !== 'change') return;
      if (message.group !== this.group) throw new Error('The server joined a different group.');
      this.username = message.username ?? '';
      this.config = message.rtcConfiguration ?? {};
      if (message.kind === 'change') {
        if (!(message.permissions ?? []).includes('present')) for (const s of this.upStreams()) this.unpublish(s.label);
        return;
      }
      this.retry = 0; this.why = '';
      this.transition(GaleneState.Joined);
      this.send({ type: 'request', request: { camera: ['audio', 'video-low'], '': ['audio', 'video'] } });
      if ((message.permissions ?? []).includes('present')) for (const label of this.media.keys()) await this.publish(label, this.media.get(label) as MediaStream);
      return;
    }
    if (type === 'usermessage' && (message.kind === 'kicked' || message.kind === 'error')) { this.fail(message.value ?? 'The call server refused the request.'); return; }
    if (this.state !== GaleneState.Joined) return;
    const id = message.id ?? '';
    if (type === 'user') {
      if (message.kind === 'delete') {
        this.users.delete(id);
        for (const s of this.downStreams()) if (s.source === id) this.drop(s);
      } else if (id !== '') this.users.set(id, message.username ?? 'Guest');
      this.onChange(); return;
    }
    if (id === '') throw new Error('The call stream has no id.');
    if (type === 'offer') { await this.answer(message); return; }
    const s = this.streams.get(id);
    if (s === undefined) return;
    if (type === 'ice') {
      const candidate = message.candidate;
      if (candidate === undefined || candidate === null || candidate.candidate === '') return;
      if (s.pc.remoteDescription === null) s.remoteIce.push(candidate); else await s.pc.addIceCandidate(candidate);
    } else if (type === 'answer' && s.up) {
      await s.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp ?? '' });
      await this.flushRemote(s);
      s.transition(StreamState.Active);
    } else if (type === 'close' && !s.up) this.drop(s);
    else if (type === 'abort' && s.up) { this.send({ type: 'close', id }); this.drop(s); }
    else if (type === 'renegotiate' && s.up) this.recoveryUnavailable(s);
  }

  private create(id: string, label: string, up: boolean): GaleneStream {
    if (this.streams.size >= 128) throw new Error('Too many call streams.');
    const s = new GaleneStream(id, label, up, this.config);
    this.streams.set(id, s);
    s.pc.onicecandidate = event => {
      if (this.streams.get(id) !== s || event.candidate === null) return;
      const candidate = event.candidate.toJSON();
      if (s.state === StreamState.New || s.state === StreamState.Negotiating) s.localIce.push(candidate);
      else this.send({ type: 'ice', id, candidate });
    };
    s.pc.oniceconnectionstatechange = () => {
      if (this.streams.get(id) === s && s.pc.iceConnectionState === 'failed') this.recoveryUnavailable(s);
    };
    return s;
  }

  private recoveryUnavailable(s: GaleneStream): void {
    // libjuice 1.7.4 rejects new ICE credentials. A new membership/PeerConnection is not an ICE restart.
    this.why = 'Media connection failed: this WebRTC backend does not support ICE restart yet.';
    this.onChange();
  }

  upStreams(): GaleneStream[] { return Array.from(this.streams.values()).filter((s: GaleneStream) => s.up); }
  downStreams(): GaleneStream[] { return Array.from(this.streams.values()).filter((s: GaleneStream) => !s.up); }

  async publish(label: string, media: MediaStream): Promise<void> {
    this.media.set(label, media);
    if (this.state !== GaleneState.Joined) return;
    this.unpublish(label, false);
    const s = this.create(toHex(randomBytes(16)), label, true);
    s.transition(StreamState.Negotiating);
    for (const track of media.getTracks()) {
      const tx = track.kind === 'video'
        ? s.pc.addTransceiver(track, { direction: 'sendonly', streams: [media], sendEncodings: [{ rid: 'h', maxBitrate: 800000, scalabilityMode: 'L1T2' }, { rid: 'l', maxBitrate: 100000, maxFramerate: 15, scaleResolutionDownBy: 4 }] })
        : s.pc.addTransceiver(track, { direction: 'sendonly', streams: [media] });
      tx.setCodecPreferences([{ mimeType: track.kind === 'video' ? 'video/VP8' : 'audio/opus', clockRate: track.kind === 'video' ? 90000 : 48000 }]);
    }
    const offer = await s.pc.createOffer();
    if (this.streams.get(s.id) !== s) return;
    await s.pc.setLocalDescription(offer);
    this.send({ type: 'offer', source: this.clientId, username: this.username, id: s.id, label, sdp: s.pc.localDescription?.sdp ?? '' });
    s.transition(StreamState.Offered);
    this.flushLocal(s);
  }

  unpublish(label: string, forget: boolean = true): void {
    if (forget) this.media.delete(label);
    for (const s of this.upStreams()) if (s.label === label) {
      if (this.state === GaleneState.Joined) this.send({ type: 'close', id: s.id });
      this.drop(s);
    }
  }

  private async answer(message: Message): Promise<void> {
    const id = message.id ?? '';
    let s = this.streams.get(id);
    if (s !== undefined && s.up) throw new Error('Duplicate call stream id.');
    const replaced = this.streams.get(message.replace ?? '');
    if (replaced !== undefined && !replaced.up) this.drop(replaced);
    if (s === undefined) {
      s = this.create(id, message.label ?? 'camera', false);
      const down = s;
      down.source = message.source ?? ''; down.username = message.username ?? 'Guest';
      down.pc.ontrack = (event: RTCTrackEvent) => {
        if (this.streams.get(id) !== down) return;
        if (event.track.kind === 'video') down.video = event.track;
        else {
          if (down.speaker !== null) down.speaker.close();
          down.audio = event.track;
          down.speaker = stream(1, 48000);
          (event.track.microphone as RemoteAudio).onData((samples: number[]) => {
            if (this.streams.get(id) !== down || down.audio !== event.track) return;
            down.audioSamples += samples.length;
            if (this.speakerOn && down.speaker !== null) down.speaker.write(samples);
          });
        }
        this.onChange();
      };
    }
    const down = s as GaleneStream;
    down.transition(StreamState.Negotiating);
    await down.pc.setRemoteDescription({ type: 'offer', sdp: message.sdp ?? '' });
    if (this.streams.get(id) !== down) return;
    await this.flushRemote(down);
    const answer = await down.pc.createAnswer();
    await down.pc.setLocalDescription(answer);
    this.send({ type: 'answer', id, sdp: down.pc.localDescription?.sdp ?? '' });
    down.transition(StreamState.Active);
    this.flushLocal(down);
    this.requestVideo(id, down.requested);
    this.onChange();
  }

  private flushLocal(s: GaleneStream): void {
    for (const candidate of s.localIce) this.send({ type: 'ice', id: s.id, candidate });
    s.localIce = [];
  }
  private async flushRemote(s: GaleneStream): Promise<void> {
    const candidates = s.remoteIce; s.remoteIce = [];
    for (const candidate of candidates) await s.pc.addIceCandidate(candidate);
  }

  requestVideo(id: string, video: TileVideo): void {
    const s = this.streams.get(id);
    if (s === undefined || s.up || this.state !== GaleneState.Joined) return;
    s.requested = video;
    this.send({ type: 'requestStream', id, request: video === 'hidden' ? ['audio'] : ['audio', video] });
    this.onChange();
  }
  selectSpeaker(id: string): void {
    for (const s of this.downStreams()) if (s.requested !== 'hidden') this.requestVideo(s.id, s.id === id ? 'video' : 'video-low');
  }

  private async measure(): Promise<void> {
    let changed = false;
    for (const s of this.downStreams()) {
      const stats = await s.pc.getStats();
      if (this.streams.get(s.id) !== s) continue;
      let video = 0, audio = 0;
      stats.forEach((r: RTCStats) => { if (r.type === 'inbound-rtp') { if (r.kind === 'video') video += r.bytesReceived; else if (r.kind === 'audio') audio += r.bytesReceived; } });
      if (s.videoBytes !== video || s.audioBytes !== audio) changed = true;
      s.videoBytes = video; s.audioBytes = audio;
    }
    if (changed) this.onChange();
  }

  private drop(s: GaleneStream): void { s.close(); this.streams.delete(s.id); this.onChange(); }
  private release(): void {
    ++this.generation;
    clearTimeout(this.timer); clearInterval(this.timer); this.timer = 0;
    if (this.discovery !== null) this.discovery.abort();
    this.discovery = null;
    const socket = this.socket; this.socket = null;
    if (socket !== null) { socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null; socket.close(); }
    for (const s of this.streams.values()) s.close();
    this.streams.clear(); this.users.clear(); this.messages = Promise.resolve();
  }
  private reconnect(why: string): void {
    this.release();
    this.why = why + ' Reconnecting…';
    this.transition(GaleneState.Backoff);
    const generation = this.generation;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.retry++, 5)));
    this.timer = setTimeout(() => { if (generation === this.generation) this.connect(); }, delay);
  }
  private fail(why: string): void { this.release(); this.why = why; this.transition(GaleneState.Failed); }
  close(): void { this.release(); this.media.clear(); this.invite = null; this.transition(GaleneState.Closed); }
}
