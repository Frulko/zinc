// The app's state and its actions: the user, the servers and their channels, the DMs, the open channel and its messages. The gateway's
// dispatches and the REST answers land here; the screen reads these fields and re-renders when changed() calls it back. No drawing.
import { Gateway, GatewayHandler } from './services/gateway';
import { api, setToken, ApiError } from './services/rest';
import { loadToken, saveToken, forgetToken } from './services/session';
import { CH_TEXT, CH_DM, CH_GROUP_DM, CH_CATEGORY, CH_ANNOUNCEMENT, MESSAGES_PAGE } from './constants';
import { env } from 'zinc:sys';

export class User { id = ''; name = ''; avatar = ''; }
export class Channel {
  id = ''; guildId = ''; type: i32 = CH_TEXT; name = ''; position: i32 = 0; parentId = ''; lastMessageId = '';
  /** Text channels and DMs open in the message view; voice, categories and forums are shown but not opened yet. */
  readable(): boolean { return this.type === CH_TEXT || this.type === CH_ANNOUNCEMENT || this.type === CH_DM || this.type === CH_GROUP_DM; }
}
export class Guild { id = ''; name = ''; icon = ''; channels: Channel[] = []; }
export class Message {
  id = ''; channelId = ''; authorId = ''; author = ''; content = ''; timestamp = ''; edited = false;
  attachments: string[] = []; replyTo = '';
}
export type Stage = 'login' | 'connecting' | 'ready' | 'reconnecting' | 'failed';

const str = (v: any): string => typeof v === 'string' ? v : '';

export class Store implements GatewayHandler {
  stage: Stage = 'login';
  error = '';
  me: User = new User();
  guilds: Guild[] = [];
  dms: Channel[] = [];
  guildId = '';                 // '' is the DM list
  channelId = '';
  messages: Map<string, Message[]> = new Map<string, Message[]>();
  loading = false;
  private users: Map<string, User> = new Map<string, User>();
  private gateway: Gateway;
  private listeners: (() => void)[] = [];
  private logging = env('DISCORD_LOG') === '1';

  constructor() { this.gateway = new Gateway(this); }
  onChange(f: () => void): void { this.listeners.push(f); }
  changed(): void { for (const f of this.listeners) f(); }
  log(line: string): void { if (this.logging) console.log(line); }

  // ------------------------------------------------------------------ session
  /** At start: a token kept in the keychain (or DISCORD_TOKEN for tests) logs in at once. */
  async resume(): Promise<void> {
    const t = env('DISCORD_TOKEN') !== '' ? env('DISCORD_TOKEN') : await loadToken();
    if (t !== '') this.connect(t);
  }
  async login(token: string): Promise<void> {
    const t = token.trim();
    if (t === '') { this.error = 'Paste your token first.'; this.changed(); return; }
    this.error = '';
    if (env('DISCORD_TOKEN') === '') {
      try { await saveToken(t); } catch (e) { this.error = `The token could not be kept in the keychain: ${e.message}`; this.changed(); return; }
    }
    this.connect(t);
  }
  async logout(): Promise<void> {
    this.gateway.stop();
    try { await forgetToken(); } catch (e) {}
    this.guilds = []; this.dms = []; this.messages.clear(); this.users.clear(); this.guildId = ''; this.channelId = '';
    this.stage = 'login'; this.changed();
  }
  /** Drops the gateway connection (tests): it must resume. */
  dropConnection(): void { this.gateway.drop(); }
  private connect(token: string): void { setToken(token); this.gateway.start(token); }

  // ------------------------------------------------------------------ GatewayHandler
  status(s: string): void {
    if (s === this.stage) return;
    if (s === 'connecting' || s === 'ready' || s === 'reconnecting' || s === 'failed') { this.stage = s; this.log(`stage ${s}`); this.changed(); }
  }
  authFailed(): void {
    this.log('auth failed');
    forgetToken().catch((): void => {});
    this.stage = 'login'; this.error = 'Discord refused this token: log in again.'; this.changed();
  }
  dispatch(t: string, d: any): void {
    if (t === 'READY') this.ready(d);
    else if (t === 'GUILD_CREATE') { this.removeGuild(str(d.id)); this.guilds.push(this.guild(d)); }
    else if (t === 'GUILD_DELETE') this.removeGuild(str(d.id));
    else if (t === 'CHANNEL_CREATE' || t === 'CHANNEL_UPDATE') this.putChannel(this.channel(d, str(d.guild_id)));
    else if (t === 'CHANNEL_DELETE') this.removeChannel(str(d.id));
    else if (t === 'MESSAGE_CREATE') this.messageCreated(d);
    else if (t === 'MESSAGE_UPDATE') this.messageUpdated(d);
    else if (t === 'MESSAGE_DELETE') this.messageDeleted(str(d.channel_id), str(d.id));
    else return;
    this.changed();
  }

  // ------------------------------------------------------------------ READY and the stores
  private user(u: any): User {
    const id = str(u.id);
    const known = this.users.get(id);
    const v = known !== undefined ? known : new User();
    v.id = id;
    v.name = str(u.global_name) !== '' ? str(u.global_name) : str(u.username);
    v.avatar = str(u.avatar);
    this.users.set(id, v);
    return v;
  }
  private ready(d: any): void {
    this.users.clear();
    this.me = this.user(d.user);
    if (Array.isArray(d.users)) for (const u of d.users) this.user(u);
    this.guilds = [];
    if (Array.isArray(d.guilds)) for (const g of d.guilds) if (g.unavailable !== true) this.guilds.push(this.guild(g));
    this.dms = [];
    if (Array.isArray(d.private_channels)) for (const c of d.private_channels) this.dms.push(this.channel(c, ''));
    this.sortDms();
    this.log(`ready ${this.me.name}: ${this.guilds.length} servers, ${this.dms.length} DMs`);
    if (this.channelId === '') this.selectGuild(this.guilds.length > 0 ? this.guilds[0].id : '');
  }
  private guild(g: any): Guild {
    const p: any = g.properties !== undefined && g.properties !== null ? g.properties : g;   // CLIENT_STATE_V2 puts the fields in properties
    const out = new Guild();
    out.id = str(g.id); out.name = str(p.name); out.icon = str(p.icon);
    if (Array.isArray(g.channels)) for (const c of g.channels) out.channels.push(this.channel(c, out.id));
    sortChannels(out.channels);
    return out;
  }
  private channel(c: any, guildId: string): Channel {
    const out = new Channel();
    out.id = str(c.id); out.guildId = guildId; out.type = c.type; out.position = c.position ?? 0;
    out.parentId = str(c.parent_id); out.lastMessageId = str(c.last_message_id); out.name = str(c.name);
    if (out.name === '' && (out.type === CH_DM || out.type === CH_GROUP_DM)) {
      const names: string[] = [];
      if (Array.isArray(c.recipients)) for (const r of c.recipients) names.push(this.user(r).name);
      if (Array.isArray(c.recipient_ids)) for (const id of c.recipient_ids) { const u = this.users.get(str(id)); if (u !== undefined) names.push(u.name); }
      out.name = names.join(', ');
    }
    return out;
  }
  private putChannel(c: Channel): void {
    if (c.guildId === '') { this.dms = this.dms.filter((x: Channel) => x.id !== c.id); this.dms.push(c); this.sortDms(); return; }
    const g = this.findGuild(c.guildId);
    if (g === null) return;
    g.channels = g.channels.filter((x: Channel) => x.id !== c.id);
    g.channels.push(c);
    sortChannels(g.channels);
  }
  private removeChannel(id: string): void {
    this.dms = this.dms.filter((x: Channel) => x.id !== id);
    for (const g of this.guilds) g.channels = g.channels.filter((x: Channel) => x.id !== id);
    this.messages.delete(id);
    if (this.channelId === id) this.channelId = '';
  }
  private removeGuild(id: string): void {
    this.guilds = this.guilds.filter((g: Guild) => g.id !== id);
    if (this.guildId === id) this.selectGuild('');
  }
  private sortDms(): void { this.dms.sort((a: Channel, b: Channel) => compareIds(b.lastMessageId, a.lastMessageId)); }
  findGuild(id: string): Guild | null { for (const g of this.guilds) if (g.id === id) return g; return null; }
  findChannel(id: string): Channel | null {
    for (const c of this.dms) if (c.id === id) return c;
    for (const g of this.guilds) for (const c of g.channels) if (c.id === id) return c;
    return null;
  }
  /** The channels of the open server, or the DMs. */
  channels(): Channel[] { const g = this.findGuild(this.guildId); return g !== null ? g.channels : this.dms; }

  // ------------------------------------------------------------------ messages
  private message(m: any): Message {
    const out = new Message();
    out.id = str(m.id); out.channelId = str(m.channel_id); out.content = str(m.content); out.timestamp = str(m.timestamp);
    out.edited = str(m.edited_timestamp) !== '';
    const a = this.user(m.author);
    out.authorId = a.id; out.author = a.name;
    if (Array.isArray(m.attachments)) for (const f of m.attachments) out.attachments.push(str(f.filename));
    const r: any = m.referenced_message;
    if (r !== undefined && r !== null) out.replyTo = `${this.user(r.author).name}: ${str(r.content).slice(0, 80)}`;
    return out;
  }
  private messageCreated(d: any): void {
    const m = this.message(d);
    const c = this.findChannel(m.channelId);
    if (c !== null) { c.lastMessageId = m.id; if (c.guildId === '') this.sortDms(); }
    const list = this.messages.get(m.channelId);
    if (list === undefined) return;            // never opened: its history is fetched when it is
    for (const x of list) if (x.id === m.id) return;
    list.push(m);
    this.log(`message in ${m.channelId} from ${m.author}: ${m.content}`);
  }
  private messageUpdated(d: any): void {
    const list = this.messages.get(str(d.channel_id));
    if (list === undefined) return;
    for (let i = 0; i < list.length; i++) if (list[i].id === str(d.id)) {
      if (d.author !== undefined) list[i] = this.message(d);      // a partial update (an embed resolved) keeps the message
      else if (typeof d.content === 'string') list[i].content = d.content;
      return;
    }
  }
  private messageDeleted(channelId: string, id: string): void {
    const list = this.messages.get(channelId);
    if (list !== undefined) this.messages.set(channelId, list.filter((m: Message) => m.id !== id));
  }

  // ------------------------------------------------------------------ navigation
  selectGuild(id: string): void {
    this.guildId = id;
    let first = '';
    for (const c of this.channels()) if (c.readable()) { first = c.id; break; }
    this.selectChannel(first);
  }
  selectChannel(id: string): void {
    this.channelId = id;
    this.changed();
    if (id !== '' && !this.messages.has(id)) this.loadHistory(id);
  }
  private async loadHistory(id: string): Promise<void> {
    this.loading = true; this.changed();
    try {
      const page: any = await api('GET', `/channels/${id}/messages?limit=${MESSAGES_PAGE}`);
      const list: Message[] = [];
      if (Array.isArray(page)) for (let i = page.length - 1; i >= 0; i--) list.push(this.message(page[i]));   // newest first on the wire
      const live = this.messages.get(id);                 // messages that arrived while the page loaded
      if (live !== undefined) for (const m of live) if (list.every((x: Message) => x.id !== m.id)) list.push(m);
      this.messages.set(id, list);
      this.log(`history ${id}: ${list.length} messages`);
    } catch (e) {
      this.error = e instanceof ApiError && e.status === 403 ? 'You cannot read this channel.' : `Could not load the messages: ${e.message}`;
      this.log(`history ${id} failed: ${e.message}`);
    }
    this.loading = false; this.changed();
  }
}

/** Snowflakes compared as numbers: a longer id is a later one. */
function compareIds(a: string, b: string): i32 { return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0; }

/** Discord's sidebar order: channels without a category first, then each category followed by its channels, by position. */
function sortChannels(list: Channel[]): void {
  const byPos = (a: Channel, b: Channel): i32 => a.position !== b.position ? a.position - b.position : compareIds(a.id, b.id);
  const cats = list.filter((c: Channel) => c.type === CH_CATEGORY).sort(byPos);
  const inCategory = (c: Channel): boolean => cats.some((cat: Channel) => cat.id === c.parentId);
  const loose = list.filter((c: Channel) => c.type !== CH_CATEGORY && !inCategory(c)).sort(byPos);
  const out: Channel[] = loose.slice();
  for (const cat of cats) {
    out.push(cat);
    for (const c of list.filter((x: Channel) => x.parentId === cat.id && x.type !== CH_CATEGORY).sort(byPos)) out.push(c);
  }
  list.length = 0;
  for (const c of out) list.push(c);
}

export const store = new Store();
