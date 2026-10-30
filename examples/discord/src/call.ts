// Voice calls (docs/reports/discord-client-research.md 4): joining a voice channel or a DM call is op 4 on the main gateway; Discord
// answers with VOICE_STATE_UPDATE (our voice session) and VOICE_SERVER_UPDATE (the voice server), and zinc:discord-voice does the rest.
// This file keeps who is in which voice channel or call, who speaks, our mute and deafen, and the voice settings (devices, volumes, input
// mode), kept on this machine with zinc:storage. No drawing.
import { VoiceConnection, VoiceState, AudioDevice, inputDevices, outputDevices } from 'zinc:discord-voice';
import { requestPermission, Microphone } from 'zinc:microphone';
import { env } from 'zinc:sys';
import * as storage from 'zinc:storage';
import { api } from './services/rest';
import { PTT_KEY } from './constants';

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
    if (v.users !== null && typeof v.users === 'object') for (const k of Object.keys(v.users)) this.users.set(k, v.users[k] as number);
  }
  text(): string {
    const users: any = {};
    for (const [k, n] of this.users) users[k] = n;
    return JSON.stringify({ input: this.input, output: this.output, inputVolume: this.inputVolume, outputVolume: this.outputVolume, users: users,
      mode: this.mode, sensitivity: this.sensitivity, pttKey: this.pttKey });
  }
  /** The sensitivity as the RMS level of the voice activity (zinc:discord-voice's threshold). */
  threshold(): number { return Math.pow(10, this.sensitivity / 20); }
}
/** A level 0..1 as dB, -100 for silence (the meter's scale). */
export const decibels = (level: number): number => level <= 0.00001 ? -100 : Math.max(-100, 20 * Math.log10(level));

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
  private flags: Map<string, VoiceFlags> = new Map<string, VoiceFlags>();
  private tick = -1;
  private meter: Microphone | null = null;
  private rooms: Map<string, string[]> = new Map<string, string[]>();   // channel id -> the users in it
  private sessionId = '';
  private server: any = null;
  private conn: VoiceConnection | null = null;
  private me: () => string;
  private op4: (guildId: string, channelId: string, mute: boolean, deaf: boolean) => void;
  private changed: () => void;
  private log: (line: string) => void;

  constructor(me: () => string, op4: (guildId: string, channelId: string, mute: boolean, deaf: boolean) => void, changed: () => void, log: (line: string) => void) {
    this.me = me; this.op4 = op4; this.changed = changed; this.log = log;
    this.settings.load(storage.get(VOICE_KEY));
    this.ptt = this.settings.mode === 'ptt';
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
  /** The call view shows: its duration moves each second. */
  watch(on: boolean): void {
    if (on && this.tick < 0) this.tick = setInterval(() => { this.changed(); }, 1000);
    if (!on && this.tick >= 0) { clearInterval(this.tick); this.tick = -1; }
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
    this.op4(guildId, channelId, this.mute, this.deaf);
    if (guildId === '' && this.members(channelId).length === 0) {
      try { await api('POST', `/channels/${channelId}/call/ring`, { recipients: null }); } catch (e) { this.log(`ring failed: ${e.message}`); }
    }
    this.changed();
  }
  leave(): void {
    if (this.channelId === '') return;
    this.op4(this.guildId, '', this.mute, this.deaf);
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
    if (tell && this.channelId !== '') this.op4(this.guildId, this.channelId, this.mute || this.deaf, this.deaf);
    this.changed();
  }
  private drop(): void {
    const c = this.conn;
    this.conn = null; this.server = null; this.sessionId = ''; this.since = 0;
    if (c !== null) c.close();
    this.speaking.clear();
  }
}
