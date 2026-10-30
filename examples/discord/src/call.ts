// Voice calls (docs/reports/discord-client-research.md 4): joining a voice channel or a DM call is op 4 on the main gateway; Discord
// answers with VOICE_STATE_UPDATE (our voice session) and VOICE_SERVER_UPDATE (the voice server), and zinc:discord-voice does the rest.
// This file keeps who is in which voice channel or call, who speaks, and our mute, deafen and push-to-talk. No drawing.
import { VoiceConnection, VoiceState } from 'zinc:discord-voice';
import { requestPermission } from 'zinc:microphone';
import { env } from 'zinc:sys';
import { api } from './services/rest';

export type CallState = VoiceState | 'idle';

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
  setPushToTalk(on: boolean): void { this.ptt = on; this.apply(false); }   // our own choice: Discord is not told
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
    if (c !== null) { c.setMute(this.mute || this.deaf); c.setDeaf(this.deaf); c.setPushToTalk(this.ptt); }
    if (tell && this.channelId !== '') this.op4(this.guildId, this.channelId, this.mute || this.deaf, this.deaf);
    this.changed();
  }
  private drop(): void {
    const c = this.conn;
    this.conn = null; this.server = null; this.sessionId = '';
    if (c !== null) c.close();
    this.speaking.clear();
  }
}
