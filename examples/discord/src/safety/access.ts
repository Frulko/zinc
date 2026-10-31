// Layer 2 of the safety model, what I may do: the guard's own picture of my permissions, kept from the gateway's dispatches (READY and
// what changes it), so no request goes that Discord would refuse (each refusal counts toward its invalid requests). Permissions are
// computed as Discord documents them (topics/permissions): @everyone's, or-ed with my roles'; the owner and ADMINISTRATOR may do
// everything; then the channel's overwrites for @everyone, my roles together, me; no VIEW_CHANNEL is nothing; a timeout leaves reading.
// When READY did not say my roles in a server, nothing is known there and nothing is refused (Discord's answer decides, once: a 403 on a
// message is not tried again in that channel). Permissions are 64-bit decimal strings, kept as two 32-bit halves.
import { CH_DM, CH_GROUP_DM, isThread } from '../constants';
import { MESSAGE_MAX, MESSAGE_MAX_NITRO, UPLOAD_FREE, UPLOAD_BASIC, UPLOAD_TIER2, UPLOAD_TIER3, UPLOAD_NITRO, YOUNG_ACCOUNT_MS, COLD_DM_QUIET_MS,
  NEW_MEMBER_MS, ACCOUNT_MIN_MS } from './policy';
import { snowflakeTime } from './core';

export class Perms { lo: number = 0; hi: number = 0; }
/** A permission string ("1071698660929") as its two halves, exactly (no float past 2^53). */
export function parsePerms(s: string): Perms {
  const p = new Perms();
  for (let i = 0; i < s.length; i++) {
    const d = s.charCodeAt(i) - 48;
    if (d < 0 || d > 9) break;
    const lo = p.lo * 10 + d;
    p.lo = lo % 4294967296;
    p.hi = (p.hi * 10 + Math.floor(lo / 4294967296)) % 4294967296;
  }
  return p;
}
const or = (a: Perms, b: Perms): Perms => { const p = new Perms(); p.lo = (a.lo | b.lo) >>> 0; p.hi = (a.hi | b.hi) >>> 0; return p; };
const andNot = (a: Perms, b: Perms): Perms => { const p = new Perms(); p.lo = (a.lo & ~b.lo) >>> 0; p.hi = (a.hi & ~b.hi) >>> 0; return p; };
export function has(p: Perms, bit: i32): boolean { return bit < 32 ? ((p.lo >>> bit) & 1) === 1 : ((p.hi >>> (bit - 32)) & 1) === 1; }
function only(p: Perms, bits: i32[]): Perms {
  const out = new Perms();
  for (const b of bits) if (has(p, b)) { if (b < 32) out.lo = (out.lo | (1 << b)) >>> 0; else out.hi = (out.hi | (1 << (b - 32))) >>> 0; }
  return out;
}
const ALL = (): Perms => { const p = new Perms(); p.lo = 4294967295; p.hi = 4294967295; return p; };

export const ADMINISTRATOR = 3, MANAGE_CHANNELS = 4, ADD_REACTIONS = 6, VIEW_CHANNEL = 10, SEND_MESSAGES = 11, MANAGE_MESSAGES = 13,
  ATTACH_FILES = 15, READ_MESSAGE_HISTORY = 16, MENTION_EVERYONE = 17, CONNECT = 20, SPEAK = 21, MOVE_MEMBERS = 24, SEND_MESSAGES_IN_THREADS = 38, PIN_MESSAGES = 51;

export class Overwrite { id = ''; type: i32 = 0; allow: Perms = new Perms(); deny: Perms = new Perms(); }
function overwrites(list: any): Overwrite[] {
  const out: Overwrite[] = [];
  if (Array.isArray(list)) for (const o of list) {
    const w = new Overwrite();
    w.id = `${o.id}`; w.type = typeof o.type === 'number' ? o.type : o.type === 'member' ? 1 : 0;
    w.allow = parsePerms(`${o.allow ?? '0'}`); w.deny = parsePerms(`${o.deny ?? '0'}`);
    out.push(w);
  }
  return out;
}

/** A server: its owner, its roles' permissions, my roles (null: not known), my timeout's end, its boost tier, when I joined it (0: long
 *  ago or not known) and its verification level. */
export class Server {
  ownerId = ''; roles: Map<string, Perms> = new Map<string, Perms>(); mine: string[] | null = null; timeoutUntil: number = 0; tier: i32 = 0;
  joinedAt: number = 0; verification: i32 = 0;
}
/** A channel as the guard sees it; lastAt: when its last message was written (its id's time). */
export class Chan { id = ''; guildId = ''; type: i32 = 0; parentId = ''; overwrites: Overwrite[] = []; slowmode: i32 = 0; userLimit: i32 = 0; recipients: string[] = []; lastAt: number = 0; }

/** My permissions in a channel of the server, null when they cannot be known. */
export function channelPerms(s: Server, guildId: string, meId: string, ows: Overwrite[], now: number): Perms | null {
  const mine = s.mine;
  if (mine === null) return null;
  if (s.ownerId !== '' && s.ownerId === meId) return ALL();
  const everyone = s.roles.get(guildId);
  let p = everyone !== undefined ? everyone : new Perms();
  for (const r of mine) { const rp = s.roles.get(r); if (rp !== undefined) p = or(p, rp); }
  if (has(p, ADMINISTRATOR)) return ALL();
  for (const o of ows) if (o.type === 0 && o.id === guildId) p = or(andNot(p, o.deny), o.allow);
  let allow = new Perms(), deny = new Perms();
  for (const o of ows) if (o.type === 0 && mine.indexOf(o.id) >= 0) { allow = or(allow, o.allow); deny = or(deny, o.deny); }
  p = or(andNot(p, deny), allow);
  for (const o of ows) if (o.type === 1 && o.id === meId) p = or(andNot(p, o.deny), o.allow);
  if (!has(p, VIEW_CHANNEL)) return new Perms();
  if (s.timeoutUntil > now) return only(p, [VIEW_CHANNEL, READ_MESSAGE_HISTORY]);
  return p;
}

const str = (v: any): string => typeof v === 'string' ? v : v === null || v === undefined ? '' : `${v}`;
const timeOf = (iso: string): number => { if (iso === '') return 0; const t = new Date(iso).getTime(); return t > 0 ? t : 0; };

/** What the guard knows of me, my servers and channels, the people I blocked, and where Discord refused my messages. */
export class Access {
  me = ''; premium: i32 = 0; status = '';
  /** My email verified (READY's user.verified; not said: taken as verified), and when my account was made (its id's time). */
  verified = true; createdAt: number = 0;
  private servers: Map<string, Server> = new Map<string, Server>();
  private chans: Map<string, Chan> = new Map<string, Chan>();
  private blocked: Set<string> = new Set<string>();
  private friends: Set<string> = new Set<string>();
  /** People seen in one of my servers (their messages, the member lists): a new DM may go to them. */
  private sharing: Set<string> = new Set<string>();
  /** Channels where Discord refused my message this session: not tried again until the channel, my roles or my relationships change. */
  refusedIn: Map<string, string> = new Map<string, string>();

  /** A dispatch of the gateway: what it changes of the picture. */
  observe(t: string, d: any): void {
    if (t === 'READY') this.ready(d);
    else if (t === 'GUILD_CREATE') this.server(d, null);
    else if (t === 'GUILD_DELETE') this.servers.delete(str(d.id));
    else if (t === 'CHANNEL_CREATE' || t === 'CHANNEL_UPDATE' || t === 'THREAD_CREATE' || t === 'THREAD_UPDATE') { this.chan(d, str(d.guild_id)); this.refusedIn.delete(str(d.id)); }
    else if (t === 'CHANNEL_DELETE' || t === 'THREAD_DELETE') this.chans.delete(str(d.id));
    else if (t === 'THREAD_LIST_SYNC') { if (Array.isArray(d.threads)) for (const c of d.threads) this.chan(c, str(d.guild_id)); }
    else if (t.startsWith('GUILD_ROLE_')) {
      const s = this.servers.get(str(d.guild_id));
      if (s === undefined) return;
      if (t === 'GUILD_ROLE_DELETE') s.roles.delete(str(d.role_id));
      else if (d.role !== undefined && d.role !== null) s.roles.set(str(d.role.id), parsePerms(str(d.role.permissions)));
      this.refusedIn.clear();
    }
    else if (t === 'GUILD_MEMBER_UPDATE') { if (d.user !== undefined && d.user !== null && str(d.user.id) === this.me) this.member(str(d.guild_id), d); }
    else if (t.startsWith('RELATIONSHIP_')) { this.relationship(t, d); this.refusedIn.clear(); }
    else if (t === 'USER_SETTINGS_UPDATE') { if (typeof d.status === 'string') this.status = d.status; }
    else if (t === 'USER_UPDATE') { if (str(d.id) === this.me && typeof d.verified === 'boolean') this.verified = d.verified; }
    else if (t === 'MESSAGE_CREATE') {
      const c = this.chans.get(str(d.channel_id));
      if (c !== undefined) c.lastAt = snowflakeTime(str(d.id));
      if (str(d.guild_id) !== '' && d.author !== undefined && d.author !== null) this.sharing.add(str(d.author.id));
    }
    else if (t === 'GUILD_MEMBER_ADD') { if (d.user !== undefined && d.user !== null) this.sharing.add(str(d.user.id)); }
    else if (t === 'GUILD_MEMBER_LIST_UPDATE' && Array.isArray(d.ops))
      for (const op of d.ops) for (const it of Array.isArray(op.items) ? op.items : op.item !== undefined ? [op.item] : [])
        if (it.member !== undefined && it.member !== null && it.member.user !== undefined) this.sharing.add(str(it.member.user.id));
  }
  private ready(d: any): void {
    this.servers.clear(); this.chans.clear(); this.blocked.clear(); this.friends.clear(); this.sharing.clear(); this.refusedIn.clear();
    this.me = str(d.user.id); this.premium = d.user.premium_type ?? 0;
    this.verified = d.user.verified !== false; this.createdAt = snowflakeTime(this.me);
    const settings: any = d.user_settings;
    this.status = settings !== undefined && settings !== null ? str(settings.status) : '';
    if (Array.isArray(d.relationships)) for (const r of d.relationships) this.relationship('RELATIONSHIP_ADD', r);
    const merged: any = d.merged_members;   // my member object in each server, in the order of guilds
    if (Array.isArray(d.guilds)) for (let i = 0; i < d.guilds.length; i++) {
      let mine: any = null;
      if (Array.isArray(merged) && Array.isArray(merged[i])) for (const m of merged[i]) if (str(m.user_id) === this.me) mine = m; else this.sharing.add(str(m.user_id));
      this.server(d.guilds[i], mine);
    }
    if (Array.isArray(d.private_channels)) for (const c of d.private_channels) this.chan(c, '');
  }
  private server(g: any, mine: any): void {
    const p: any = g.properties !== undefined && g.properties !== null ? g.properties : g;   // CLIENT_STATE_V2 puts the fields in properties
    const s = new Server();
    const id = str(g.id);
    s.ownerId = str(p.owner_id); s.tier = p.premium_tier ?? 0;
    const roles: any = Array.isArray(g.roles) ? g.roles : p.roles;
    if (Array.isArray(roles)) for (const r of roles) s.roles.set(str(r.id), parsePerms(str(r.permissions)));
    this.servers.set(id, s);
    if (Array.isArray(g.members)) for (const m of g.members) if (m.user !== undefined && m.user !== null) {
      if (str(m.user.id) !== this.me) this.sharing.add(str(m.user.id)); else if (mine === null) mine = m;
    }
    s.joinedAt = timeOf(str(p.joined_at !== undefined ? p.joined_at : g.joined_at)); s.verification = p.verification_level ?? 0;
    if (mine !== null) this.member(id, mine);
    if (Array.isArray(g.channels)) for (const c of g.channels) this.chan(c, id);
    if (Array.isArray(g.threads)) for (const c of g.threads) this.chan(c, id);
  }
  private member(guildId: string, m: any): void {
    const s = this.servers.get(guildId);
    if (s === undefined) return;
    const roles: string[] = [];
    if (Array.isArray(m.roles)) for (const r of m.roles) roles.push(str(r));
    s.mine = roles;
    const until = str(m.communication_disabled_until);
    s.timeoutUntil = until !== '' ? new Date(until).getTime() : 0;
    const joined = timeOf(str(m.joined_at));
    if (joined > 0) s.joinedAt = joined;
    this.refusedIn.clear();
  }
  private chan(c: any, guildId: string): void {
    const out = new Chan();
    out.id = str(c.id); out.guildId = guildId !== '' ? guildId : str(c.guild_id); out.type = c.type ?? 0; out.parentId = str(c.parent_id);
    out.overwrites = overwrites(c.permission_overwrites); out.slowmode = c.rate_limit_per_user ?? 0; out.userLimit = c.user_limit ?? 0;
    if (Array.isArray(c.recipient_ids)) for (const id of c.recipient_ids) out.recipients.push(str(id));
    if (Array.isArray(c.recipients)) for (const r of c.recipients) out.recipients.push(str(r.id));
    const known = this.chans.get(out.id);
    out.lastAt = Math.max(snowflakeTime(str(c.last_message_id)), known !== undefined ? known.lastAt : 0);
    this.chans.set(out.id, out);
  }
  private relationship(t: string, d: any): void {
    const id = str(d.id) !== '' ? str(d.id) : d.user !== undefined && d.user !== null ? str(d.user.id) : '';
    const on = t !== 'RELATIONSHIP_REMOVE';
    if (on && d.type === 2) this.blocked.add(id); else this.blocked.delete(id);
    if (on && d.type === 1) this.friends.add(id); else this.friends.delete(id);
  }

  /** Rule 19: an account younger than YOUNG_ACCOUNT_MS, or with no verified email. */
  limited(now: number): boolean { return !this.verified || (this.createdAt > 0 && now - this.createdAt < YOUNG_ACCOUNT_MS); }
  isFriend(userId: string): boolean { return this.friends.has(userId); }
  /** Rule 12: why a new DM with the person may not be opened ('' when it may): only friends and people sharing a server. */
  cannotOpenDm(userId: string): string {
    if (this.blocked.has(userId)) return 'You blocked this person.';
    return this.friends.has(userId) || this.sharing.has(userId) ? '' : 'Not sent: new DMs go only to friends and people who share a server with you.';
  }
  /** Rule 14: a DM where nobody wrote for COLD_DM_QUIET_MS. */
  coldDm(ch: string, now: number): boolean {
    const c = this.chans.get(ch);
    return c !== undefined && (c.type === CH_DM || c.type === CH_GROUP_DM) && now - c.lastAt > COLD_DM_QUIET_MS;
  }
  /** Rule 7: a cold DM with nobody who is my friend in it (its first message holds no link or invite). */
  strangerDm(ch: string, now: number): boolean {
    if (!this.coldDm(ch, now)) return false;
    for (const id of (this.chans.get(ch) as Chan).recipients) if (this.friends.has(id)) return false;
    return true;
  }
  private serverOf(ch: string): Server | null {
    const c = this.chans.get(ch);
    const s = c !== undefined && c.guildId !== '' ? this.servers.get(c.guildId) : undefined;
    return s !== undefined ? s : null;
  }
  /** Rule 18: a server I joined less than NEW_MEMBER_MS ago. */
  newMember(ch: string, now: number): boolean { const s = this.serverOf(ch); return s !== null && now - s.joinedAt < NEW_MEMBER_MS; }
  /** Rule 18: why nothing may be written yet in the channel, as the server's verification level says (High: 10 minutes a member;
   *  Medium: an account older than 5 minutes), '' when it may. */
  verificationWait(ch: string, now: number): string {
    const s = this.serverOf(ch);
    if (s === null) return '';
    if (s.verification >= 3 && now - s.joinedAt < NEW_MEMBER_MS) return 'This server lets new members write 10 minutes after joining.';
    if (s.verification >= 2 && this.createdAt > 0 && now - this.createdAt < ACCOUNT_MIN_MS) return 'This server lets accounts write 5 minutes after they are made.';
    return '';
  }

  /** My permissions in a server's channel (a thread: its parent's), null for a DM or when it cannot be known. */
  perms(ch: string, now: number): Perms | null {
    const c = this.chans.get(ch);
    if (c === undefined || c.guildId === '') return null;
    const s = this.servers.get(c.guildId);
    if (s === undefined) return null;
    const parent = isThread(c.type) ? this.chans.get(c.parentId) : undefined;
    return channelPerms(s, c.guildId, this.me, parent !== undefined ? parent.overwrites : c.overwrites, now);
  }
  /** Whether a permission is missing for sure (unknown: not missing). */
  lacks(ch: string, bit: i32, now: number): boolean { const p = this.perms(ch, now); return p !== null && !has(p, bit); }
  /** Why I cannot write in the channel, '' when I can or cannot tell. */
  cannotSend(ch: string, now: number): string {
    const c = this.chans.get(ch);
    if (c === undefined) return '';
    const refused = this.refusedIn.get(ch);
    if (refused !== undefined) return refused;
    if (c.type === CH_DM) for (const id of c.recipients) if (this.blocked.has(id)) return 'You blocked this person: unblock them in Discord to write here.';
    if (this.lacks(ch, isThread(c.type) ? SEND_MESSAGES_IN_THREADS : SEND_MESSAGES, now)) return 'You do not have permission to send messages here.';
    return '';
  }
  /** Whether I may pin and unpin in the channel: always in a DM; in a server, with Manage Messages or Pin Messages (the owner and
   *  administrators have both). Unknown: no (the button is not offered, nothing is sent that Discord would refuse). */
  mayPin(ch: string, now: number): boolean {
    const c = this.chans.get(ch);
    if (c === undefined) return false;
    if (c.guildId === '') return true;
    const p = this.perms(ch, now);
    return p !== null && (has(p, MANAGE_MESSAGES) || has(p, PIN_MESSAGES));
  }
  isBlocked(userId: string): boolean { return this.blocked.has(userId); }
  slowmodeS(ch: string, now: number): i32 {
    const c = this.chans.get(ch);
    if (c === undefined || c.slowmode <= 0) return 0;
    const p = this.perms(ch, now);
    return p !== null && (has(p, MANAGE_MESSAGES) || has(p, MANAGE_CHANNELS)) ? 0 : c.slowmode;   // they are not slowed
  }
  userLimit(ch: string): i32 { const c = this.chans.get(ch); return c !== undefined ? c.userLimit : 0; }
  messageMax(): i32 { return this.premium === 2 ? MESSAGE_MAX_NITRO : MESSAGE_MAX; }
  /** The largest file I may send in the channel: my Nitro's or the server's boost tier's, whichever is larger. */
  uploadMax(ch: string): number {
    if (this.premium === 2) return UPLOAD_NITRO;
    let n = this.premium === 1 || this.premium === 3 ? UPLOAD_BASIC : UPLOAD_FREE;
    const c = this.chans.get(ch), s = c !== undefined ? this.servers.get(c.guildId) : undefined;
    if (s !== undefined && s.tier === 2) n = Math.max(n, UPLOAD_TIER2);
    if (s !== undefined && s.tier === 3) n = Math.max(n, UPLOAD_TIER3);
    return n;
  }
}
