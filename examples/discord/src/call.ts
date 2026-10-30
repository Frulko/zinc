// Voice calls (docs/reports/discord-client-research.md 4): joining a voice channel or a DM call is op 4 on the main gateway; Discord
// answers with VOICE_STATE_UPDATE (our voice session) and VOICE_SERVER_UPDATE (the voice server), and zinc:discord-voice does the rest.
// This file keeps who is in which voice channel or call, who speaks, our mute and deafen, and the voice settings (devices, volumes, input
// mode), kept on this machine with zinc:storage. Video: our camera (zinc:camera) sent while it is on, and the others' cameras decoded only
// while the call view shows them and the window is not minimized, at the size of their tile. Go Live: a screen or a window shared
// (zinc:screen-capture, captured at exactly the size and rate sent) over its own connection to the stream's server, and the others' streams
// watched one at a time, decoded only while shown, at their tile's size or the full view's. Quality: the connections' RTCP counters read
// each second (CallQuality: good, fair, poor), and the ultra low data mode, chosen in the settings or switched on after 5 poor seconds.
// No drawing.
import { VoiceConnection, VoiceState, AudioDevice, VideoQuality, inputDevices, outputDevices } from 'zinc:discord-voice';
import { CallQuality, RTCStats } from 'zinc:webrtc/quality';
import { ScreenCapture } from 'zinc:screen-capture';
import { pickScreen, ShareChoice } from 'zinc:screen-capture/picker';
import { requestPermission, Microphone } from 'zinc:microphone';
import { Camera, requestPermission as cameraPermission } from 'zinc:camera';
import { pixelScale } from 'zinc:gfx';
import { addSignalListener, appState, repaint } from 'zinc:ui';
import { env } from 'zinc:sys';
import * as storage from 'zinc:storage';
import { api } from './services/rest';
import { PTT_KEY, TILE_W, TILE_H, FULL_W, FULL_H } from './constants';

export type CallState = VoiceState | 'idle';
const VOICE_KEY = 'voice';

/** The 'Voice & audio' settings, as Discord has them: volumes in percent (0 to 200), the sensitivity in dB (-100 to 0: the microphone's
 *  level under which nothing is sent), devices by id ('' the system's default). */
export class VoiceSettings {
  input = '';
  output = '';
  inputVolume = 100;
  outputVolume = 100;
  /** user id -> percent; a user at 100 is not listed */
  users: Map<string, number> = new Map<string, number>();
  mode = 'voice';          // 'voice' (voice activity) or 'ptt' (push-to-talk)
  sensitivity = -40;
  pttKey = PTT_KEY;
  /** Video quality, as Discord offers it: the camera's height (360 or 720), Go Live's resolution ('720', '1080', 'source') and rate. */
  camera = 360;
  streamRes = '720';
  streamFps = 30;
  /** The ultra low data mode (zinc:discord-voice's setLowDataMode), always on, or switched on for a call after 5 poor seconds. */
  lowData = false;
  autoLowData = true;

  load(text: string): void {
    if (text === '') return;
    const v: any = JSON.parse(text);
    if (typeof v.input === 'string') this.input = v.input;
    if (typeof v.output === 'string') this.output = v.output;
    if (typeof v.inputVolume === 'number') this.inputVolume = v.inputVolume;
    if (typeof v.outputVolume === 'number') this.outputVolume = v.outputVolume;
    if (v.mode === 'ptt' || v.mode === 'voice') this.mode = v.mode;
    if (typeof v.sensitivity === 'number') this.sensitivity = v.sensitivity;
    if (typeof v.pttKey === 'string' && v.pttKey !== '') this.pttKey = v.pttKey;
    if (v.camera === 360 || v.camera === 720) this.camera = v.camera;
    if (v.streamRes === '720' || v.streamRes === '1080' || v.streamRes === 'source') this.streamRes = v.streamRes;
    if (v.streamFps === 15 || v.streamFps === 30 || v.streamFps === 60) this.streamFps = v.streamFps;
    if (typeof v.lowData === 'boolean') this.lowData = v.lowData;
    if (typeof v.autoLowData === 'boolean') this.autoLowData = v.autoLowData;
    if (v.users !== null && typeof v.users === 'object') for (const k of Object.keys(v.users)) this.users.set(k, v.users[k] as number);
  }
  text(): string {
    const users: any = {};
    for (const [k, n] of this.users) users[k] = n;
    return JSON.stringify({ input: this.input, output: this.output, inputVolume: this.inputVolume, outputVolume: this.outputVolume, users: users,
      mode: this.mode, sensitivity: this.sensitivity, pttKey: this.pttKey, camera: this.camera, streamRes: this.streamRes, streamFps: this.streamFps,
      lowData: this.lowData, autoLowData: this.autoLowData });
  }
  /** The sensitivity as the RMS level of the voice activity (zinc:discord-voice's threshold). */
  threshold(): number { return Math.pow(10, this.sensitivity / 20); }
}
/** A level 0..1 as dB, -100 for silence (the meter's scale). */
export const decibels = (level: number): number => level <= 0.00001 ? -100 : Math.max(-100, 20 * Math.log10(level));

/** Go Live's choices without Nitro: 720p at 15 or 30 fps (Discord's limit for everyone else). */
export const streamAllowed = (nitro: boolean, res: string, fps: number): boolean => nitro || (res === '720' && fps <= 30);
/** A snowflake minus one (decimal strings: they do not fit a double): the DAVE group of a Go Live stream is its rtc_server_id - 1. */
export function snowflakeMinus1(id: string): string {
  const d = id.split('');
  let i = d.length - 1;
  while (i >= 0 && d[i] === '0') { d[i] = '9'; i--; }
  if (i >= 0) d[i] = String.fromCharCode(d[i].charCodeAt(0) - 1);
  const out = d.join('');
  return out.length > 1 && out[0] === '0' ? out.substring(1) : out;
}

/** A Go Live stream: ours, or one we watch. Its key names it on the main gateway; STREAM_CREATE gives its rtc server, STREAM_SERVER_UPDATE
 *  the server to connect to. */
export class Live {
  key = '';
  user = '';
  rtc = '';
  conn: VoiceConnection | null = null;
}

/** What the others show of themselves on VOICE_STATE_UPDATE. */
export interface VoiceFlags { mute: boolean; deaf: boolean }

export class Call {
  /** The voice channel or DM we are in ('' when none), and its server ('' for a DM). */
  channelId = '';
  guildId = '';
  state: CallState = 'idle';
  error = '';
  mute = false;
  deaf = false;
  ptt = false;
  /** Who speaks now (user ids, ours included). */
  speaking: Set<string> = new Set<string>();
  /** The DMs that ring us (CALL_CREATE / CALL_UPDATE with our id in `ringing`). */
  ringing: Set<string> = new Set<string>();
  /** When the call connected (Date.now()), 0 before: the call view's duration. */
  since = 0;
  settings: VoiceSettings = new VoiceSettings();
  /** The settings wait for a key to make push-to-talk's. */
  recordingKey = false;
  /** Our camera is on (sent to the call, shown in our tile). */
  video = false;
  /** The call's health, a reading a second while connected (the call bar's bars, the CallStats panel), and the panel shown. */
  quality: CallQuality = new CallQuality();
  statsOpen = false;
  /** The ultra low data mode was switched on by 5 poor seconds (for this call only). */
  autoLow = false;
  private sampler = -1;
  private cam: Camera | null = null;
  private viewOn = false;                                       // the call view shows the tiles
  private images: Map<string, i32> = new Map<string, i32>();   // user -> the image of their camera on screen
  private frames = -1;                                          // the timer that moves those images to their newest frame
  private decoded = 0;
  private flags: Map<string, VoiceFlags> = new Map<string, VoiceFlags>();
  private tick = -1;
  private meter: Microphone | null = null;
  private rooms: Map<string, string[]> = new Map<string, string[]>();   // channel id -> the users in it
  private sessionId = '';
  private server: any = null;
  private conn: VoiceConnection | null = null;
  private me: () => string;
  private op4: (guildId: string, channelId: string, mute: boolean, deaf: boolean, video: boolean) => void;
  private changed: () => void;
  private log: (line: string) => void;

  /** Go Live: who streams in the channels we know of (VOICE_STATE_UPDATE self_stream), ours, the one we watch and whether it fills the
   *  call view, and Nitro (above 720p 30 fps). */
  live: Set<string> = new Set<string>();
  sharing: Live | null = null;
  watching: Live | null = null;
  focused = false;
  nitro = false;
  private screen: ScreenCapture | null = null;
  private screenQ: VideoQuality = { width: 1280, height: 720, fps: 30 };
  private streamImg = -1;
  private gw: (op: i32, d: any) => void;

  constructor(me: () => string, op4: (guildId: string, channelId: string, mute: boolean, deaf: boolean, video: boolean) => void, changed: () => void, log: (line: string) => void,
    gw: (op: i32, d: any) => void) {
    this.me = me; this.op4 = op4; this.changed = changed; this.log = log; this.gw = gw;
    this.settings.load(storage.get(VOICE_KEY));
    this.ptt = this.settings.mode === 'ptt';
    // minimized or hidden: no camera is decoded (and the server sends none); back: they come again
    addSignalListener((kind: string, arg: string): void => { if (kind === 'background' || kind === 'foreground') this.videoWatch(); });
  }

  // ------------------------------------------------------------------ the voice settings
  inputs(): AudioDevice[] { return inputDevices(); }
  outputs(): AudioDevice[] { return outputDevices(); }
  /** Changes the settings (`f` edits them), keeps them and gives them to the call at once. */
  set(f: (s: VoiceSettings) => void): void {
    f(this.settings);
    storage.set(VOICE_KEY, this.settings.text());
    this.ptt = this.settings.mode === 'ptt';
    const m = this.meter;
    if (m !== null && m.id !== this.settings.input) { this.meterOn(false); this.meterOn(true); }
    this.apply(false);
  }
  /** The ultra low data mode is on: chosen, or switched on by a poor connection. */
  lowData(): boolean { return this.settings.lowData || this.autoLow; }
  /** The mode by hand (kept); off also ends an automatic one. */
  setLowData(on: boolean): void { if (!on) this.autoLow = false; this.set((s: VoiceSettings): void => { s.lowData = on; }); }
  toggleStats(): void { this.statsOpen = !this.statsOpen; this.changed(); }
  /** Every connection of the call's counters in one report: the voice one's, our stream's, the watched one's. */
  getStats(): Map<string, RTCStats> {
    const out = new Map<string, RTCStats>();
    for (const c of this.conns()) c.getStats().forEach((s: RTCStats, id: string): void => { out.set(id, s); });
    return out;
  }
  private conns(): VoiceConnection[] {
    const all: VoiceConnection[] = [];
    const c = this.conn, o = this.sharing, w = this.watching;
    if (c !== null) all.push(c);
    if (o !== null && o.conn !== null) all.push(o.conn as VoiceConnection);
    if (w !== null && w.conn !== null) all.push(w.conn as VoiceConnection);
    return all;
  }
  /** A reading a second while connected; after 5 poor ones in a row the ultra low data mode comes on (when allowed: autoLowData). */
  private sample(): void {
    if (this.state !== 'connected') return;
    const q = this.quality.update(this.getStats());
    if (this.settings.autoLowData && !this.lowData() && this.quality.poorFor >= 5) {
      this.autoLow = true;
      this.log(`voice ultra low data on: ${q.lossPct.toFixed(0)}% lost, ${Math.round(q.rttMs)} ms`);
      this.apply(false);
    }   // the call view repaints each second on its own (watch())
  }
  userVolume(id: string): number { const v = this.settings.users.get(id); return v !== undefined ? v : 100; }
  setUserVolume(id: string, percent: number): void {
    this.set((s: VoiceSettings): void => { if (percent === 100) s.users.delete(id); else s.users.set(id, percent); });
    const c = this.conn;
    if (c !== null) c.setUserVolume(id, percent / 100);   // back to 100 is no longer listed, so not given again by apply()
  }
  /** The microphone's level now, 0..1 after the input volume: the call's own while in one, else the meter's microphone (meterOn). */
  level(): number {
    const c = this.conn;
    if (c !== null) return c.level();
    const m = this.meter;
    return m !== null ? Math.min(1, m.level() * this.settings.inputVolume / 100) : 0;
  }
  /** The settings' meter outside a call: the chosen microphone open while they show. */
  meterOn(on: boolean): void {
    const m = this.meter;
    if (!on) { if (m !== null) { m.close(); this.meter = null; } return; }
    if (m !== null) return;
    const id = this.settings.input;
    (async (): Promise<void> => {
      if (env('ZINC_FAKE_MICROPHONE') === '' && await requestPermission() !== 'granted') return;
      let mic: Microphone;
      try { mic = await Microphone.open(id); } catch (e) { mic = await Microphone.open(''); }   // the chosen one is gone: the default
      if (this.meter !== null || this.settings.input !== id) { mic.close(); return; }
      this.meter = mic;
    })();
  }
  /** Someone's mute and deafen as they show them (a speaking ring is not drawn for a muted user). */
  flagsOf(id: string): VoiceFlags { const f = this.flags.get(id); return f !== undefined ? f : { mute: false, deaf: false }; }
  /** The call view shows: its duration moves each second, and the cameras of its tiles are decoded. */
  watch(on: boolean): void {
    if (on && this.tick < 0) this.tick = setInterval(() => { this.changed(); }, 1000);
    if (!on && this.tick >= 0) { clearInterval(this.tick); this.tick = -1; }
    if (on !== this.viewOn) { this.viewOn = on; this.videoWatch(); }
  }

  // ------------------------------------------------------------------ video
  /** Someone sends a camera (us: ours is on). */
  hasVideo(id: string): boolean { if (id === this.me()) return this.video; const c = this.conn; return c !== null && c.cameras.has(id); }
  /** The image of someone's camera on screen (ours: the camera's own), -1 before its first frame. */
  videoOf(id: string): i32 {
    if (id === this.me()) { const m = this.cam; return m !== null ? m.image : -1; }
    const i = this.images.get(id);
    return i !== undefined ? i : -1;
  }
  /** [frames sent, packets sent, frames decoded, key frames asked, key frames asked of us] */
  videoStats(): number[] { const c = this.conn; return c !== null ? c.videoStats() : [0, 0, 0, 0, 0]; }
  /** Turns our camera on (the system's question first; op 4 self_video and the voice gateway's op 12 tell the others) or off. */
  async toggleVideo(): Promise<void> {
    if (this.video) { this.cameraOff(); this.apply(); return; }
    if (env('ZINC_FAKE_CAMERA') === '' && await cameraPermission() !== 'granted') {
      this.error = 'Camera access is off for this app (System Settings > Privacy & Security > Camera).'; this.changed(); return;
    }
    let cam: Camera;
    const hd = this.settings.camera === 720;
    try { cam = await Camera.open('', { width: hd ? 1280 : 640, height: hd ? 720 : 360, fps: 30 }); } catch (e) { this.error = `Camera: ${e.message}`; this.changed(); return; }
    if (this.channelId === '' || this.cam !== null) { cam.close(); return; }
    this.cam = cam; this.video = true;
    cam.onFrame((i: number): void => {
      const c = this.conn;
      if (c !== null) c.sendImage(cam.image);
      if (this.viewOn && appState() === 'active') repaint();   // our tile shows the camera's image
    });
    const c = this.conn;
    if (c !== null) c.setCamera(true, this.cameraQ());
    this.apply();
  }
  private cameraQ(): VideoQuality { const m = this.cam; return m !== null ? { width: m.width, height: m.height, fps: m.fps } : { width: 640, height: 360, fps: 30 }; }
  private cameraOff(): void {
    if (!this.video && this.cam === null) return;   // nothing to tell anyone
    const m = this.cam;
    this.cam = null; this.video = false;
    if (m !== null) m.close();
    const c = this.conn;
    if (c !== null) c.setCamera(false);
  }
  /** Which cameras to decode, at which size: the others' in the tiles while the call view shows and the window is not minimized. A timer
   *  moves their images to the newest frame and repaints only when one came. */
  private videoWatch(): void {
    const c = this.conn;
    const shown: Map<string, number[]> = new Map<string, number[]>();
    if (c !== null && this.viewOn && appState() === 'active') {
      const k = pixelScale();
      for (const id of this.members(this.channelId)) if (c.cameras.has(id)) shown.set(id, [TILE_W * k, TILE_H * k]);
    }
    if (c !== null) c.watch(shown);
    for (const id of Array.from(this.images.keys())) if (!shown.has(id)) this.images.delete(id);
    // the stream we watch: at its tile's size, or the full view's
    const w = this.watching, sc = w !== null ? w.conn : null;
    const stream = sc !== null && w !== null && this.viewOn && appState() === 'active' && sc.cameras.has(w.user);
    if (sc !== null && w !== null) {
      const k = pixelScale(), want: Map<string, number[]> = new Map<string, number[]>();
      if (stream) want.set(w.user, this.focused ? [FULL_W * k, FULL_H * k] : [TILE_W * k, TILE_H * k]);
      sc.watch(want);
    }
    if (!stream) this.streamImg = -1;
    const any = shown.size > 0 || stream;
    if (any && this.frames < 0) this.frames = setInterval(() => { this.pull(); }, 33);
    if (!any && this.frames >= 0) { clearInterval(this.frames); this.frames = -1; }
  }
  private pull(): void {
    const c = this.conn, w = this.watching, sc = w !== null ? w.conn : null;
    const n = (c !== null ? c.videoStats()[2] : 0) + (sc !== null ? sc.videoStats()[2] : 0);
    if (n === this.decoded) return;
    this.decoded = n;
    let fresh = false;
    if (c !== null) for (const id of c.cameras.keys()) {
      const img = c.videoImage(id);
      if (img < 0) continue;
      if (this.images.get(id) !== img) { this.images.set(id, img); fresh = true; }
    }
    if (sc !== null && w !== null) { const img = sc.videoImage(w.user); if (img !== this.streamImg) { this.streamImg = img; fresh = true; } }
    if (fresh) this.changed(); else repaint();   // a new image (the first, or a new size) is a new element; the same one only repaints
  }

  // ------------------------------------------------------------------ Go Live
  /** A stream's key on the main gateway: guild:<guild>:<channel>:<user>, or call:<channel>:<user> in a DM. */
  private keyOf(user: string): string { return this.guildId !== '' ? `guild:${this.guildId}:${this.channelId}:${user}` : `call:${this.channelId}:${user}`; }
  /** Go Live: the share dialog (zinc:screen-capture/picker: the source, the resolution and rate, kept for next time), then the source captured
   *  at exactly that size and rate (never bigger than what is sent) and op 18 asks for the stream. */
  async shareScreen(): Promise<void> {
    if (this.channelId === '') return;
    this.error = '';
    const s = this.settings;
    let picked: ShareChoice | null = null;
    try {
      picked = await pickScreen({ title: 'Go Live', shareLabel: 'Go Live', resolution: s.streamRes, frameRate: s.streamFps, lockedNote: 'Nitro',
        allowed: (res: string, fps: number): boolean => streamAllowed(this.nitro, res, fps) });
    } catch (e) { this.error = `Screen sharing: ${e.message}`; this.changed(); return; }
    if (picked === null || this.channelId === '') return;
    const c: ShareChoice = picked;
    if (c.resolution !== s.streamRes || c.frameRate !== s.streamFps) this.set((v: VoiceSettings): void => { v.streamRes = c.resolution; v.streamFps = c.frameRate; });
    this.stopLive();
    let cap: ScreenCapture;
    try { cap = await ScreenCapture.open(c.sourceId, { width: c.width, height: c.height, frameRate: c.frameRate, cursor: c.cursor }); }
    catch (e) { this.error = `Screen sharing: ${e.message}`; this.changed(); return; }
    if (this.channelId === '' || this.sharing !== null) { cap.close(); return; }
    const l = new Live();
    l.key = this.keyOf(this.me()); l.user = this.me();
    this.sharing = l; this.screen = cap;
    this.screenQ = { width: cap.width, height: cap.height, fps: cap.fps };
    cap.onFrame((i: number): void => {
      const sc = l.conn;
      if (sc !== null) sc.sendImage(cap.image);
      if (this.viewOn && appState() === 'active') repaint();   // our stream's tile shows the capture
    });
    cap.onEnded((why: string): void => { if (this.sharing === l) { this.stopLive(); this.error = `Screen sharing ended: ${why}`; } });
    this.log(`voice go live ${cap.width}x${cap.height} ${cap.fps} fps`);
    this.gw(18, { type: this.guildId !== '' ? 'guild' : 'call', guild_id: this.guildId !== '' ? this.guildId : null, channel_id: this.channelId, preferred_region: null });
    this.changed();
  }
  /** Stops sharing: op 19, the capture and the encoder stop, the stream's connection closes. */
  stopLive(): void {
    const l = this.sharing;
    if (l === null) return;
    this.gw(19, { stream_key: l.key });
    this.endLive(l);
  }
  /** Watches someone's stream (op 20); one at a time. */
  watchStream(user: string): void {
    if (this.channelId === '' || user === this.me()) return;
    const w = this.watching;
    if (w !== null) { if (w.user === user) return; this.stopWatching(); }
    const l = new Live();
    l.key = this.keyOf(user); l.user = user;
    this.watching = l; this.focused = false;
    this.gw(20, { stream_key: l.key });
    this.changed();
  }
  /** Stops watching: op 19 with the stream's key, its connection closes. */
  stopWatching(): void {
    const l = this.watching;
    if (l === null) return;
    this.gw(19, { stream_key: l.key });
    this.endLive(l);
  }
  /** The watched stream fills the call view (decoded at its size) or goes back to its tile. */
  focus(on: boolean): void { this.focused = on && this.watching !== null; this.videoWatch(); this.changed(); }
  /** The image of a stream on screen: ours from the capture, the watched one's newest decoded frame; -1 when none. */
  streamOf(user: string): i32 {
    if (user === this.me()) { const c = this.screen; return c !== null ? c.image : -1; }
    const w = this.watching;
    return w !== null && w.user === user ? this.streamImg : -1;
  }
  /** STREAM_CREATE (the stream's rtc server), STREAM_SERVER_UPDATE (its voice server: the connection opens), STREAM_DELETE (it ended). */
  streamEvent(t: string, d: any): void {
    const key = `${d.stream_key}`, own = this.sharing, w = this.watching;
    const l = own !== null && own.key === key ? own : w !== null && w.key === key ? w : null;
    if (l === null) return;
    if (t === 'STREAM_CREATE' && d.rtc_server_id !== null && d.rtc_server_id !== undefined) l.rtc = `${d.rtc_server_id}`;
    else if (t === 'STREAM_SERVER_UPDATE' && l.rtc !== '' && d.endpoint !== null && d.endpoint !== undefined) this.streamConnect(l, `${d.endpoint}`, `${d.token}`);
    else if (t === 'STREAM_DELETE') { this.endLive(l); if (l === own && d.reason !== 'user_requested') this.error = `Your stream ended (${d.reason})`; }
  }
  private streamConnect(l: Live, endpoint: string, token: string): void {
    const old = l.conn;
    l.conn = null;
    if (old !== null) old.close();
    if (this.sessionId === '') return;
    const conn = new VoiceConnection({ endpoint: endpoint, token: token, serverId: l.rtc, channelId: snowflakeMinus1(l.rtc), userId: this.me(),
      sessionId: this.sessionId, stream: true });
    l.conn = conn;
    conn.log = this.log;
    const ours = l === this.sharing;
    if (ours) conn.setCamera(true, this.screenQ);   // op 12 once connected, then the capture's frames
    conn.setLowDataMode(this.lowData());
    conn.onState = (st: VoiceState): void => {
      if (l.conn !== conn) return;
      if (st === 'connected' && ours) this.gw(22, { stream_key: l.key, paused: false });
      if (st === 'closed') { l.conn = null; if (conn.reason !== 'left') this.error = `Stream disconnected: ${conn.reason}`; }
      this.changed();
    };
    conn.onVideo = (): void => { if (l.conn === conn) { this.videoWatch(); this.changed(); } };
  }
  /** Ends a stream here (ours or the watched one) without telling the gateway: its capture, its connection, its decoding. */
  private endLive(l: Live): void {
    const c = l.conn;
    l.conn = null;
    if (c !== null) c.close();
    if (l === this.sharing) { this.sharing = null; const cap = this.screen; this.screen = null; if (cap !== null) cap.close(); }
    if (l === this.watching) { this.watching = null; this.focused = false; this.streamImg = -1; }
    this.videoWatch();
    this.changed();
  }

  /** The users in a voice channel or DM call. */
  members(channelId: string): string[] { const r = this.rooms.get(channelId); return r !== undefined ? r : []; }
  stats(): number[] { const c = this.conn; return c !== null ? c.stats() : [0, 0, 0, 0, 0, 0]; }
  mode(): string { const c = this.conn; return c !== null ? c.mode : ''; }
  /** The call is end-to-end encrypted (DAVE: the lock of the official client). */
  e2ee(): boolean { const c = this.conn; return c !== null && c.e2ee; }

  /** Joins a voice channel (guildId: its server) or a DM call (guildId ''); a DM nobody is in yet rings the others. */
  async join(channelId: string, guildId: string): Promise<void> {
    if (this.channelId === channelId && this.state !== 'closed') return;
    if (this.channelId !== '') this.leave();
    this.error = '';
    if (env('ZINC_FAKE_MICROPHONE') === '') {   // the system's question, once; the fake microphone needs none
      const p = await requestPermission();
      if (p === 'denied') { this.error = 'Microphone access is off for this app (System Settings > Privacy & Security > Microphone).'; this.changed(); return; }
    }
    this.channelId = channelId; this.guildId = guildId; this.state = 'connecting';
    this.op4(guildId, channelId, this.mute, this.deaf, this.video);
    if (guildId === '' && this.members(channelId).length === 0) {
      try { await api('POST', `/channels/${channelId}/call/ring`, { recipients: null }); } catch (e) { this.log(`ring failed: ${e.message}`); }
    }
    this.changed();
  }
  leave(): void {
    if (this.channelId === '') return;
    this.op4(this.guildId, '', this.mute, this.deaf, false);
    this.drop();
    this.channelId = ''; this.guildId = ''; this.state = 'idle';
    this.changed();
  }
  toggleMute(): void {
    // as in Discord: unmuting while deafened undeafens too
    if (this.mute && this.deaf) this.deaf = false;
    this.mute = !this.mute;
    this.apply();
  }
  toggleDeaf(): void { this.deaf = !this.deaf; this.apply(); }
  /** The input mode of the settings: push-to-talk, or the voice activity (our own choice: Discord is not told). */
  setPushToTalk(on: boolean): void { this.set((s: VoiceSettings): void => { s.mode = on ? 'ptt' : 'voice'; }); }
  /** The push-to-talk key went down or up. */
  hold(down: boolean): void { const c = this.conn; if (c !== null) c.hold(down); }

  /** VOICE_STATE_UPDATE: someone joined, moved or left; ours carries the voice session. */
  stateUpdate(d: any): void {
    const user = `${d.user_id}`, ch: string = d.channel_id !== null && d.channel_id !== undefined ? `${d.channel_id}` : '';
    for (const [id, list] of this.rooms) {
      const i = list.indexOf(user);
      if (i >= 0) { list.splice(i, 1); if (list.length === 0) this.rooms.delete(id); }
    }
    if (ch !== '') { const r = this.rooms.get(ch); if (r !== undefined) r.push(user); else this.rooms.set(ch, [user]); }
    if (ch !== '') this.flags.set(user, { mute: d.self_mute === true || d.mute === true, deaf: d.self_deaf === true || d.deaf === true });
    else this.flags.delete(user);
    if (ch !== '' && d.self_stream === true) this.live.add(user); else this.live.delete(user);
    const w = this.watching;
    if (w !== null && w.user === user && (ch !== this.channelId || d.self_stream !== true)) this.endLive(w);   // their stream ended
    if (user !== this.me()) return;
    if (ch === '' || ch !== this.channelId) {   // left from another device, or moved: this call is over here
      if (this.channelId !== '' && this.state !== 'connecting') { this.drop(); this.channelId = ''; this.guildId = ''; this.state = 'idle'; }
      return;
    }
    this.sessionId = `${d.session_id}`;
    this.connect();
  }
  /** VOICE_SERVER_UPDATE: the voice server of our call (a null endpoint: being moved, another one follows). */
  serverUpdate(d: any): void {
    if (this.channelId === '' || d.endpoint === null || d.endpoint === undefined) return;
    const old = this.conn;
    this.conn = null;
    if (old !== null) old.close();
    this.server = d;
    this.connect();
  }
  /** CALL_CREATE, CALL_UPDATE, CALL_DELETE of a DM. */
  callUpdate(t: string, d: any): void {
    const ch = `${d.channel_id}`;
    let rings = false;
    if (t !== 'CALL_DELETE' && Array.isArray(d.ringing)) for (const id of d.ringing) if (`${id}` === this.me()) rings = true;
    if (rings) this.ringing.add(ch); else this.ringing.delete(ch);
    if (t === 'CALL_CREATE' && Array.isArray(d.voice_states)) for (const v of d.voice_states) this.stateUpdate(v);
  }

  private connect(): void {
    const s: any = this.server;
    if (this.conn !== null || this.sessionId === '' || s === null) return;
    const conn = new VoiceConnection({ endpoint: `${s.endpoint}`, token: `${s.token}`, serverId: s.guild_id !== null && s.guild_id !== undefined ? `${s.guild_id}` : this.channelId,
      channelId: this.channelId, userId: this.me(), sessionId: this.sessionId });
    this.conn = conn;
    conn.log = this.log;
    conn.onState = (st: VoiceState): void => {
      if (this.conn !== conn) return;
      this.state = st;
      if (st === 'connected' && this.since === 0) this.since = Date.now();
      if (st === 'closed') { this.error = conn.reason !== 'left' ? `Voice disconnected: ${conn.reason}` : ''; this.conn = null; this.speaking.clear(); }
      this.changed();
    };
    conn.onVideo = (): void => { if (this.conn === conn) { this.videoWatch(); this.changed(); } };
    if (this.video) conn.setCamera(true, this.cameraQ());   // sent once the connection is up
    this.quality.reset();
    if (this.sampler < 0) this.sampler = setInterval(() => { this.sample(); }, 1000);
    conn.onSpeaking = (who: string[]): void => {
      if (this.conn !== conn) return;
      this.speaking.clear();
      for (const w of who) this.speaking.add(w === 'me' ? this.me() : w);
      this.changed();
    };
    this.apply(false);
  }
  /** The controls to the connection, and our mute and deafen to Discord (op 4: the others see them). */
  private apply(tell: boolean = true): void {
    const c = this.conn;
    if (c !== null) {
      const s = this.settings;
      c.setMute(this.mute || this.deaf); c.setDeaf(this.deaf); c.setPushToTalk(this.ptt);
      c.setDevices(s.input, s.output);
      c.setVolumes(s.inputVolume / 100, s.outputVolume / 100, s.threshold());
      for (const [u, v] of s.users) c.setUserVolume(u, v / 100);
    }
    for (const x of this.conns()) x.setLowDataMode(this.lowData());
    if (tell && this.channelId !== '') this.op4(this.guildId, this.channelId, this.mute || this.deaf, this.deaf, this.video);
    this.changed();
  }
  private drop(): void {
    this.cameraOff();
    this.stopLive();
    this.stopWatching();
    const c = this.conn;
    this.conn = null; this.server = null; this.sessionId = ''; this.since = 0;
    if (c !== null) c.close();
    if (this.sampler >= 0) { clearInterval(this.sampler); this.sampler = -1; }
    this.autoLow = false; this.statsOpen = false;
    this.speaking.clear();
    this.videoWatch();
  }
}
