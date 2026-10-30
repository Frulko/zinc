// zinc:discord-voice: a Discord voice connection (docs/reports/discord-client-research.md 4, docs/plugins/discord-voice.md). The program
// joins a channel on the main gateway (op 4) and hands what VOICE_STATE_UPDATE and VOICE_SERVER_UPDATE gave to `new VoiceConnection()`;
// this file speaks the voice gateway v8 (JSON over zinc:socket: Identify, heartbeats with seq_ack, Select Protocol, Speaking, Resume) and
// the native side (native/voice.host.cpp) carries the media on its own thread: UDP and IP discovery, the _rtpsize transport encryption,
// Opus, a jitter buffer per speaker, the mix, the microphone and the speakers. DAVE, the end-to-end encryption every call has used since
// March 2026: this file runs its state machine (ops 21 to 31, binary for the MLS messages) and libdave on the native side holds the group
// and encrypts each frame. Video (docs/reports/discord-client-research.md 5.2) rides on the same UDP: op 12 says who sends a camera and
// on which SSRC (ours too), op 15 (Media Sink Wants) asks the server for each stream we show at a quality, 0 for the others; the native
// side decodes only the streams watch() names, at their size.
import { WebSocket, MessageEvent, CloseEvent } from 'zinc:socket';
import S from './native/voice.spec';

const OP_IDENTIFY = 0, OP_SELECT_PROTOCOL = 1, OP_READY = 2, OP_HEARTBEAT = 3, OP_SESSION_DESCRIPTION = 4, OP_SPEAKING = 5,
  OP_HEARTBEAT_ACK = 6, OP_RESUME = 7, OP_HELLO = 8, OP_RESUMED = 9, OP_CLIENTS_CONNECT = 11, OP_VIDEO = 12, OP_CLIENT_DISCONNECT = 13,
  OP_MEDIA_SINK_WANTS = 15;
// DAVE (daveprotocol.com): JSON 21 prepare transition, 22 execute transition, 23 transition ready, 24 prepare epoch, 31 invalid commit or
// welcome; binary 25 external sender, 26 key package, 27 proposals, 28 commit and welcome, 29 announce commit, 30 welcome
const OP_DAVE_PREPARE_TRANSITION = 21, OP_DAVE_EXECUTE_TRANSITION = 22, OP_DAVE_TRANSITION_READY = 23, OP_DAVE_PREPARE_EPOCH = 24,
  OP_DAVE_EXTERNAL_SENDER = 25, OP_DAVE_KEY_PACKAGE = 26, OP_DAVE_PROPOSALS = 27, OP_DAVE_COMMIT_WELCOME = 28, OP_DAVE_ANNOUNCE_COMMIT = 29,
  OP_DAVE_WELCOME = 30, OP_DAVE_INVALID_COMMIT_WELCOME = 31;
const SPEAKING_MICROPHONE = 1;
// close codes after which the session cannot go on: authentication, session no longer valid, timed out, disconnected (kicked, the
// channel deleted), unknown encryption mode
const FINAL = [4004, 4006, 4009, 4014, 4016];
const POLL_MS = 50;
// what Select Protocol offers: Opus, and H.264 (VideoToolbox on both sides, the server's default video codec); RTX is declared, not used
const CODECS: any[] = [{ name: 'opus', type: 'audio', priority: 1000, payload_type: 120 },
  { name: 'H264', type: 'video', priority: 1000, payload_type: 101, rtx_payload_type: 102, encode: true, decode: true }];
// our camera's stream as op 12 describes it (cameras offer quality 100; one layer, no simulcast)
const CAMERA_W = 640, CAMERA_H = 360, CAMERA_FPS = 30, CAMERA_BPS = 1000000;

/** What the main gateway gave: VOICE_SERVER_UPDATE's endpoint and token, VOICE_STATE_UPDATE's session id. */
export interface VoiceServer {
  endpoint: string;    // host[:port], or a ws:// or wss:// URL (a test server)
  token: string;
  serverId: string;    // the guild id, or the channel id of a DM call
  channelId: string;   // the voice channel or DM: the id of DAVE's group
  userId: string;
  sessionId: string;
}
export type VoiceState = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export class VoiceConnection {
  state: VoiceState = 'connecting';
  /** Why the connection closed ('' while it lives). */
  reason = '';
  /** The encryption mode Session Description chose. */
  mode = '';
  /** The call is end-to-end encrypted (DAVE): our frames leave under the group's key. onState is called when it changes. */
  e2ee = false;
  /** Who speaks now (user ids, and 'me' while we send), called when it changes. */
  onSpeaking: (who: string[]) => void = (who: string[]): void => {};
  onState: (s: VoiceState) => void = (s: VoiceState): void => {};
  /** The users in the call, from the voice gateway (op 11 and 13). */
  users: Set<string> = new Set<string>();
  log: (line: string) => void = (line: string): void => {};
  /** Who sends a camera now (user id -> the SSRC of their stream), from op 12; onVideo is called when it changes. */
  cameras: Map<string, u32> = new Map<string, u32>();
  onVideo: () => void = (): void => {};

  private server: VoiceServer;
  private ws: WebSocket | null = null;
  private h: i32 = -1;
  private seq: i32 = -1;
  private beat = -1;
  private poll = -1;
  private ssrc: u32 = 0;
  private serverModes: string[] = [];
  private speakingSent = false;
  private heard = '';
  private resumed = false;
  private mute = false;
  private deaf = false;
  private ptt = false;
  private held = false;
  private dave: i32 = 0;                                    // the DAVE protocol version of the call (0: none)
  private transitions: Map<i32, i32> = new Map<i32, i32>();   // transition id -> the protocol version it moves to
  private input = '';
  private output = '';
  private gains: number[] = [1, 1, 0.01];                     // microphone, output, voice activity threshold
  private userGains: Map<string, number> = new Map<string, number>();
  private videoSsrc: u32 = 0;                                 // our camera's stream (Ready's streams), its RTX
  private rtxSsrc: u32 = 0;
  private camera = false;
  private wants = '';                                         // the last op 15 sent
  private watched: Map<string, u32> = new Map<string, u32>();   // user -> the SSRC decoded for them

  constructor(server: VoiceServer) {
    this.server = server;
    this.open();
  }
  /** mute: we send nothing; deaf: we hear nothing (Discord's deafen mutes too: the program sends both flags on op 4). */
  setMute(on: boolean): void { this.mute = on; this.controls(); }
  setDeaf(on: boolean): void { this.deaf = on; this.controls(); }
  /** Push-to-talk: only send while held(true); off, the voice activity decides. */
  setPushToTalk(on: boolean): void { this.ptt = on; this.controls(); }
  hold(down: boolean): void { this.held = down; this.controls(); }
  /** The microphone and the speakers by id (inputDevices(), outputDevices(); '' the system's default), switched at once during a call. */
  setDevices(input: string, output: string): void { this.input = input; this.output = output; this.audio(); }
  /** Gains of the microphone and of everything heard (0 to 2, 1 as is), and the voice activity threshold: the microphone's RMS level
   *  (0..1, level()) under which nothing is sent. Push-to-talk ignores the threshold. */
  setVolumes(input: number, output: number, threshold: number): void { this.gains = [input, output, threshold]; this.audio(); }
  /** How loud one user is heard (0 to 2, 1 as is). */
  setUserVolume(user: string, gain: number): void { this.userGains.set(user, gain); if (this.h >= 0) S.setUserVolume(this.h, user, gain); }
  /** The microphone's level now, RMS 0..1 after its gain, sent or not (a meter against the threshold). */
  level(): number { return this.h >= 0 ? S.level(this.h) : 0; }
  /** [packets sent, received, decryption failures, frames decoded, frames mixed, late or lost] */
  stats(): number[] { return this.h >= 0 ? S.stats(this.h) : [0, 0, 0, 0, 0, 0]; }
  /** [video frames encoded, video packets sent, video frames decoded, key frames we asked for, key frames asked of us] */
  videoStats(): number[] { return this.h >= 0 ? S.videoStats(this.h) : [0, 0, 0, 0, 0]; }

  /** Sends our camera (op 12 describes the stream, then each sendImage() frame goes out) or stops it (op 12 with no stream). The program
   *  also tells the main gateway (op 4 self_video). */
  setCamera(on: boolean): void { this.camera = on; this.describeVideo(); }
  /** A frame of our camera (a runtime image: zinc:camera's `image`), encoded and sent on the media thread. */
  sendImage(image: i32): void { if (this.h >= 0 && this.camera && image >= 0) S.sendImage(this.h, image); }
  /** The cameras shown and their size in pixels (user id -> [width, height]); the others are not decoded, and the server is asked for
   *  each shown stream at a quality that fits its size (100, or 50 for a small tile) and for none of the rest (op 15, sent on a change). */
  watch(shown: Map<string, number[]>): void {
    if (this.h < 0) return;
    const want: any = {}, pixels: any = {};
    for (const [user, ssrc] of this.cameras) {
      const s = shown.get(user);
      const w: i32 = s !== undefined ? Math.round(s[0]) : 0, ht: i32 = s !== undefined ? Math.round(s[1]) : 0;
      want[`${ssrc}`] = w > 0 ? (w * ht >= CAMERA_W * CAMERA_H ? 100 : 50) : 0;
      if (w > 0) pixels[`${ssrc}`] = w * ht;
      S.watch(this.h, ssrc, user, w, ht);
      if (w > 0) this.watched.set(user, ssrc); else this.watched.delete(user);
    }
    for (const [user, ssrc] of this.watched) if (this.cameras.get(user) !== ssrc) { S.watch(this.h, ssrc, user, 0, 0); this.watched.delete(user); }
    want.pixelCounts = pixels;
    const text = JSON.stringify(want);
    if (text !== this.wants) { this.wants = text; this.send(OP_MEDIA_SINK_WANTS, want); }
  }
  /** The newest frame of someone's camera as a runtime image (moved to it now), -1 when none is decoded. */
  videoImage(user: string): i32 { const s = this.watched.get(user); return this.h >= 0 && s !== undefined ? S.videoImage(this.h, s) : -1; }
  /** Leaves: the voice socket closes with 1000 and the media stops. The program also sends op 4 with a null channel. */
  close(): void { this.end('left'); }

  private controls(): void { if (this.h >= 0) S.controls(this.h, this.mute, this.deaf, this.ptt, this.held); }
  private audio(): void {
    if (this.h < 0) return;
    S.setDevices(this.h, this.input, this.output);
    S.setAudio(this.h, this.gains[0], this.gains[1], this.gains[2]);
  }
  private url(): string {
    const e = this.server.endpoint;
    return (e.startsWith('ws://') || e.startsWith('wss://') ? e : `wss://${e}`) + '/?v=8';
  }
  private open(): void {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = (): void => {
      if (this.resumed) this.send(OP_RESUME, { server_id: this.server.serverId, session_id: this.server.sessionId, token: this.server.token, seq_ack: this.seq });
      else this.send(OP_IDENTIFY, { server_id: this.server.serverId, user_id: this.server.userId, session_id: this.server.sessionId,
        token: this.server.token, max_dave_protocol_version: S.daveVersion(), video: true, streams: [{ type: 'video', rid: '100', quality: 100 }] });
    };
    ws.onmessage = (e: MessageEvent): void => { if (this.ws === ws) { if (e.binary) this.binary(e.bytes); else this.receive(JSON.parse(e.data)); } };
    ws.onclose = (e: CloseEvent): void => { if (this.ws === ws) this.closed(e.code); };
  }
  private send(op: i32, d: any): void { const ws = this.ws; if (ws !== null) ws.send(JSON.stringify({ op: op, d: d })); }
  /** A binary message: the opcode, then the payload. */
  private sendBinary(op: i32, payload: u8[]): void {
    const ws = this.ws;
    if (ws === null) return;
    const b: u8[] = [op];
    for (const x of payload) b.push(x);
    ws.sendBytes(b);
  }
  private setState(s: VoiceState): void { if (this.state !== s) { this.state = s; this.log(`voice ${s}`); this.onState(s); } }

  private receive(m: any): void {
    if (typeof m.seq === 'number') this.seq = m.seq;
    const op: i32 = m.op, d: any = m.d;
    if (op === OP_HELLO) {
      if (this.beat >= 0) clearInterval(this.beat);
      this.beat = setInterval(() => { this.send(OP_HEARTBEAT, { t: Date.now(), seq_ack: this.seq }); }, d.heartbeat_interval);
    } else if (op === OP_READY) this.ready(d);
    else if (op === OP_SESSION_DESCRIPTION) this.described(d);
    else if (op === OP_SPEAKING) { if (this.h >= 0 && d.user_id !== undefined) S.bind(this.h, d.ssrc, `${d.user_id}`); }
    else if (op === OP_CLIENTS_CONNECT) { for (const id of d.user_ids) this.users.add(`${id}`); }
    else if (op === OP_CLIENT_DISCONNECT) { this.users.delete(`${d.user_id}`); if (this.cameras.delete(`${d.user_id}`)) this.onVideo(); }
    else if (op === OP_VIDEO) this.video(d);
    else if (op === OP_MEDIA_SINK_WANTS) {}   // what the server wants of our stream: one layer, sent as it is
    else if (op === OP_RESUMED) this.setState('connected');
    else if (op === OP_DAVE_PREPARE_TRANSITION) this.prepare(d.transition_id, d.protocol_version);
    else if (op === OP_DAVE_EXECUTE_TRANSITION) this.execute(d.transition_id);
    else if (op === OP_DAVE_PREPARE_EPOCH) { if (d.epoch === 1) { this.dave = d.protocol_version; this.keyPackage(); } }
    else if (op !== OP_HEARTBEAT_ACK) this.log(`voice op ${op}`);
  }
  /** Ready: our SSRC and the UDP endpoint. IP discovery runs on the native side; its answer selects the protocol. */
  private ready(d: any): void {
    this.ssrc = d.ssrc;
    if (Array.isArray(d.streams) && d.streams.length > 0) { this.videoSsrc = d.streams[0].ssrc; this.rtxSsrc = d.streams[0].rtx_ssrc ?? this.videoSsrc + 1; }
    this.serverModes = [];
    for (const x of d.modes) this.serverModes.push(`${x}`);
    const h = S.connect(`${d.ip}`, d.port, this.ssrc);
    if (h < 0) { this.end(S.error()); return; }
    this.h = h;
    this.controls();
    this.audio();
    for (const [u, g] of this.userGains) S.setUserVolume(h, u, g);
    const t = setInterval(() => {
      if (this.h !== h) { clearInterval(t); return; }
      const got = S.discovered(h);
      if (got === '') return;
      clearInterval(t);
      const [address, port] = got.split('\u001f');
      const mode = S.modes().split('\u001f').find((x: string) => this.serverModes.indexOf(x) >= 0);
      if (mode === undefined) { this.end(`no shared encryption mode (the server offers ${this.serverModes.join(', ')})`); return; }
      this.log(`voice discovered ${address}:${port}, mode ${mode}`);
      this.send(OP_SELECT_PROTOCOL, { protocol: 'udp', data: { address: address, port: parseInt(port), mode: mode }, codecs: CODECS });
    }, 10);
  }
  private described(d: any): void {
    const key: u8[] = [];
    for (const b of d.secret_key) key.push(b);
    this.mode = `${d.mode}`;
    if (!S.start(this.h, this.mode, key)) { this.end(S.error()); return; }
    this.dave = d.dave_protocol_version ?? 0;
    if (this.dave > 0) this.keyPackage();
    this.setState('connected');
    if (this.camera) this.describeVideo();   // a camera turned on while connecting, or a resumed session
    if (this.poll < 0) this.poll = setInterval(() => { this.tick(); }, POLL_MS);
  }
  /** Speaking (op 5) when we start and stop sending, and onSpeaking when who is heard changes. */
  private tick(): void {
    if (this.h < 0) return;
    const now = S.speaking(this.h);
    const who: string[] = now === '' ? [] : now.split('\u001e').map((r: string) => r.split('\u001f')[0]);
    const me = who.indexOf('me') >= 0;
    if (me !== this.speakingSent) {
      this.speakingSent = me;
      this.send(OP_SPEAKING, { speaking: me ? SPEAKING_MICROPHONE : 0, delay: 0, ssrc: this.ssrc });
    }
    const key = who.join(',');
    if (key !== this.heard) { this.heard = key; this.onSpeaking(who); }
    const st = S.daveState(this.h).split('\u001f');
    const e2ee = st[0] !== '0' && st[1] === '1';
    if (st.length > 4 && st[4] !== '') this.log(`voice dave: ${st[4]}`);
    if (e2ee !== this.e2ee) { this.e2ee = e2ee; this.log(`voice end-to-end encrypted ${e2ee}`); this.onState(this.state); }
  }
  // ------------------------------------------------------------------ video
  /** Op 12 from the server: someone's camera started (a video SSRC) or stopped (0, or no active stream). */
  private video(d: any): void {
    const user = `${d.user_id}`;
    if (user === this.server.userId || d.user_id === undefined) return;
    if (this.h >= 0 && typeof d.audio_ssrc === 'number' && d.audio_ssrc !== 0) S.bind(this.h, d.audio_ssrc, user);
    let ssrc: u32 = typeof d.video_ssrc === 'number' ? d.video_ssrc : 0;
    if (Array.isArray(d.streams)) for (const st of d.streams) if (st.active === false && st.ssrc === ssrc) ssrc = 0;
    if (ssrc !== 0) { if (this.cameras.get(user) === ssrc) return; this.cameras.set(user, ssrc); }
    else if (!this.cameras.delete(user)) return;
    this.log(`voice camera ${user} ${ssrc !== 0 ? 'on' : 'off'}`);
    this.onVideo();
  }
  /** Op 12 from us: our stream, before its first packet (else the server drops the connection: invalid SSRC), or none. */
  private describeVideo(): void {
    if (this.h < 0 || this.state !== 'connected' || this.videoSsrc === 0) return;
    const on = this.camera;
    S.videoSend(this.h, on ? this.videoSsrc : 0);
    this.send(OP_VIDEO, { audio_ssrc: this.ssrc, video_ssrc: on ? this.videoSsrc : 0, rtx_ssrc: on ? this.rtxSsrc : 0,
      streams: on ? [{ type: 'video', rid: '100', ssrc: this.videoSsrc, rtx_ssrc: this.rtxSsrc, active: true, quality: 100,
        max_bitrate: CAMERA_BPS, max_framerate: CAMERA_FPS, max_resolution: { type: 'fixed', width: CAMERA_W, height: CAMERA_H } }] : [] });
  }
  // ------------------------------------------------------------------ DAVE
  /** Our key package for a new group (op 26). */
  private keyPackage(): void {
    const kp = S.daveInit(this.h, this.dave, this.server.channelId, this.server.userId);
    if (kp.length > 0) this.sendBinary(OP_DAVE_KEY_PACKAGE, kp);
    this.log(`voice dave v${this.dave}: key package of ${kp.length} bytes`);
  }
  private recognized(): string { const ids: string[] = [this.server.userId]; for (const u of this.users) ids.push(u); return ids.join('\u001f'); }
  /** A server-to-client binary message: its sequence number (v8), the opcode, the payload. */
  private binary(b: u8[]): void {
    if (b.length < 3 || this.h < 0) return;
    this.seq = (b[0] << 8) | b[1];
    const op: i32 = b[2], payload = b.slice(3);
    if (op === OP_DAVE_EXTERNAL_SENDER) S.daveExternalSender(this.h, payload);
    else if (op === OP_DAVE_PROPOSALS) {
      const cw = S.daveProposals(this.h, payload, this.recognized());
      if (cw.length > 0) this.sendBinary(OP_DAVE_COMMIT_WELCOME, cw);
    } else if ((op === OP_DAVE_ANNOUNCE_COMMIT || op === OP_DAVE_WELCOME) && payload.length >= 2) {
      const id: i32 = (payload[0] << 8) | payload[1], body = payload.slice(2);
      const r = op === OP_DAVE_ANNOUNCE_COMMIT ? S.daveCommit(this.h, body) : S.daveWelcome(this.h, body, this.recognized());
      this.log(`voice dave ${op === OP_DAVE_ANNOUNCE_COMMIT ? 'commit' : 'welcome'} ${r > 0 ? 'applied' : r === 0 ? 'ignored' : 'failed'}${r < 0 ? `: ${S.daveState(this.h).split('\u001f')[4]}` : ''}`);
      if (r < 0) { this.send(OP_DAVE_INVALID_COMMIT_WELCOME, { transition_id: id }); this.keyPackage(); return; }   // join again from scratch
      if (r > 0) this.prepare(id, this.dave);
    } else this.log(`voice dave op ${op}`);
  }
  /** A transition: id 0 takes effect at once (the first group), the others when op 22 says so, after we answered ready (op 23). */
  private prepare(id: i32, version: i32): void {
    if (id === 0) { S.daveExecute(this.h, version); return; }
    this.transitions.set(id, version);
    this.send(OP_DAVE_TRANSITION_READY, { transition_id: id });
  }
  private execute(id: i32): void {
    const v = this.transitions.get(id);
    if (v === undefined) return;
    this.transitions.delete(id);
    this.dave = v;
    S.daveExecute(this.h, v);
  }

  private closed(code: i32): void {
    this.ws = null;
    if (this.state === 'closed') return;
    if (FINAL.indexOf(code) >= 0 || this.h < 0) { this.end(`voice gateway closed (${code})`); return; }
    // the media keeps flowing over UDP; the gateway resumes
    this.log(`voice gateway closed (${code}), resuming`);
    this.setState('reconnecting');
    this.resumed = true;
    setTimeout(() => { if (this.state === 'reconnecting') this.open(); }, 500);
  }
  private end(why: string): void {
    if (this.state === 'closed') return;
    this.reason = why;
    if (this.beat >= 0) { clearInterval(this.beat); this.beat = -1; }
    if (this.poll >= 0) { clearInterval(this.poll); this.poll = -1; }
    if (this.h >= 0) { S.close(this.h); this.h = -1; }   // and the images of the cameras
    this.watched.clear();
    this.wants = '';
    if (this.cameras.size > 0) { this.cameras.clear(); this.onVideo(); }
    const ws = this.ws;
    this.ws = null;
    if (ws !== null) ws.close(1000, '');
    this.setState('closed');
    if (this.heard !== '') { this.heard = ''; this.onSpeaking([]); }
  }
}

export interface AudioDevice { id: string; name: string }
function audioDevices(output: boolean): AudioDevice[] {
  const out: AudioDevice[] = [];
  for (const r of S.devices(output).split('\u001e')) if (r !== '') { const f = r.split('\u001f'); out.push({ id: f[0], name: f[1] }); }
  return out;
}
/** The microphones a call can use (the ids of zinc:microphone's devices()); with ZINC_FAKE_MICROPHONE=1, the fake one only. */
export function inputDevices(): AudioDevice[] { return audioDevices(false); }
/** The speakers and headphones a call can play to; with ZINC_FAKE_MICROPHONE=1, "Zinc Fake Speakers" only (nothing is played). */
export function outputDevices(): AudioDevice[] { return audioDevices(true); }

/** The encryption modes this side supports, best first. */
export function modes(): string[] { return S.modes().split('\u001f'); }
/** RTP framing and the transport encryption on their own (the tests' vectors). */
export function rtpHeader(seq: i32, timestamp: u32, ssrc: u32): u8[] { return S.header(seq, timestamp, ssrc); }
export function seal(mode: string, key: u8[], header: u8[], counter: u32, payload: u8[]): u8[] { return S.seal(mode, key, header, counter, payload); }
export function unseal(mode: string, key: u8[], packet: u8[]): u8[] { return S.unseal(mode, key, packet); }
