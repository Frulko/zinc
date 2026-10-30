// The app's state and its actions: the user, the servers and their channels, the DMs, the open channel and its messages. The gateway's
// dispatches and the REST answers land here; the screen reads these fields and re-renders when changed() calls it back. No drawing.
import { Gateway, GatewayHandler } from './services/gateway';
import { api, setToken, setRestLog, ApiError } from './services/rest';
import { loadToken, saveToken, forgetToken } from './services/session';
import { onPicture } from './services/cdn';
import { Upload, readUpload, uploadFiles } from './services/upload';
import { MemberRow, subscription, applyMemberListUpdate } from './members';
import { CH_TEXT, CH_DM, CH_GROUP_DM, CH_CATEGORY, CH_ANNOUNCEMENT, MESSAGES_PAGE, OLDER_PAGE, MESSAGE_MAX, TYPING_EVERY_MS, TYPING_SHOWN_MS, ACK_DELAY_MS, DISCORD_EPOCH, UPLOAD_MAX } from './constants';
import { env } from 'zinc:sys';
import * as storage from 'zinc:storage';
import { windowFocused } from 'zinc:ui';
import { NotifyRules, Where } from './notify';
import { Call } from './call';

export class User { id = ''; name = ''; avatar = ''; }
export class Channel {
  id = ''; guildId = ''; type: i32 = CH_TEXT; name = ''; position: i32 = 0; parentId = ''; lastMessageId = '';
  /** Text channels and DMs open in the message view; voice, categories and forums are shown but not opened yet. */
  readable(): boolean { return this.type === CH_TEXT || this.type === CH_ANNOUNCEMENT || this.type === CH_DM || this.type === CH_GROUP_DM; }
}
export class Guild { id = ''; name = ''; icon = ''; channels: Channel[] = []; roles: Map<string, string> = new Map<string, string>(); }
/** A file of a message: an image is shown (its size known before it loads, so the list does not jump), another file is a link. */
export class Attachment {
  id = ''; filename = ''; url = ''; width: i32 = 0; height: i32 = 0; size: i32 = 0;
  image(): boolean { return this.width > 0 && this.height > 0 && this.url !== ''; }
}
export class Message {
  id = ''; channelId = ''; authorId = ''; author = ''; content = ''; timestamp = ''; edited = false;
  attachments: Attachment[] = []; replyTo = '';
  /** Sent from here: the nonce that finds the server's echo; pending until the answer or the echo comes, failed when it was refused. */
  nonce = ''; pending = false; failed = false;
  /** Who it mentions (user ids) and whether it mentions everyone. */
  mentions: string[] = []; mentionsEveryone = false;
}
/** A channel's read state: the last message read and how many mentions came since. */
export class ReadState { lastId = ''; mentions: i32 = 0; }
class Typist { userId = ''; name = ''; until: number = 0; }
export type Stage = 'login' | 'connecting' | 'ready' | 'reconnecting' | 'failed';

const str = (v: any): string => typeof v === 'string' ? v : '';
const SERVERS_KEY = 'servers';
const sortedIds = (s: Set<string>): string[] => { const out: string[] = []; s.forEach((v: string): void => { out.push(v); }); return out.sort(); };

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
  /** The composer: its text, the message it answers or edits (null: a new message). */
  draft = '';
  replyTo: Message | null = null;
  editing: Message | null = null;
  /** Messages whose spoilers were clicked open. */
  revealed: Set<string> = new Set<string>();
  /** The member list of the open server's open channel (members.ts), and the server it is of. */
  members: MemberRow[] = [];
  membersOf = '';
  /** The settings screen is open (in place of the messages). */
  settingsOpen = false;
  /** The servers shown, chosen in the settings and kept on this machine (zinc:storage), never sent to Discord: null until a choice is
   *  made (every server shows), then an allowlist. `known`: the servers the settings listed, so one joined after is new (and off). */
  private allowed: Set<string> | null = null;
  private known: Set<string> = new Set<string>();
  /** Who notifies (notify.ts), and what shows a notification (services/notifications.ts; null: none). */
  rules: NotifyRules = new NotifyRules();
  notifier: ((m: Message, c: Channel) => void) | null = null;
  private reads: Map<string, ReadState> = new Map<string, ReadState>();
  private complete: Set<string> = new Set<string>();   // channels whose whole history is loaded
  private older = '';                                   // the channel whose page before is on its way
  private typists: Map<string, Typist[]> = new Map<string, Typist[]>();
  private typingTimer = -1;
  private lastTypingAt: number = 0;
  private ackTimer = -1;
  private users: Map<string, User> = new Map<string, User>();
  private gateway: Gateway;
  /** The voice call (call.ts). */
  call: Call;
  private listeners: (() => void)[] = [];
  private logging = env('DISCORD_LOG') === '1';

  constructor() {
    this.gateway = new Gateway(this);
    this.call = new Call((): string => this.me.id, (g: string, c: string, mute: boolean, deaf: boolean): void => { this.gateway.voiceState(g, c, mute, deaf); },
      (): void => { this.changed(); }, (line: string): void => { this.log(line); });
    setRestLog((line: string): void => { this.log(line); });
    onPicture((): void => { this.changed(); }, (line: string): void => { this.log(line); });
    const saved = storage.get(SERVERS_KEY);
    if (saved !== '') {
      const v: any = JSON.parse(saved), allowed = new Set<string>();
      if (Array.isArray(v.allowed)) for (const id of v.allowed) allowed.add(str(id));
      if (Array.isArray(v.known)) for (const id of v.known) this.known.add(str(id));
      this.allowed = allowed;
    }
  }
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
    this.call.leave();
    this.gateway.stop();
    try { await forgetToken(); } catch (e) {}
    this.guilds = []; this.dms = []; this.messages.clear(); this.users.clear(); this.reads.clear(); this.typists.clear(); this.guildId = ''; this.channelId = '';
    this.members = []; this.membersOf = ''; this.complete.clear();
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
    else if (t === 'GUILD_CREATE') {
      this.removeGuild(str(d.id)); this.guilds.push(this.guild(d));
      const p: any = d.properties !== undefined && d.properties !== null ? d.properties : d;
      if (typeof p.default_message_notifications === 'number') this.rules.setDefault(str(d.id), p.default_message_notifications);
    }
    else if (t === 'USER_GUILD_SETTINGS_UPDATE') this.rules.update(d)
    else if (t === 'GUILD_DELETE') this.removeGuild(str(d.id));
    else if (t === 'CHANNEL_CREATE' || t === 'CHANNEL_UPDATE') this.putChannel(this.channel(d, str(d.guild_id)));
    else if (t === 'CHANNEL_DELETE') this.removeChannel(str(d.id));
    else if (t === 'MESSAGE_CREATE') this.messageCreated(d);
    else if (t === 'MESSAGE_UPDATE') this.messageUpdated(d);
    else if (t === 'MESSAGE_DELETE') this.messageDeleted(str(d.channel_id), str(d.id));
    else if (t === 'TYPING_START') this.typingStarted(d);
    else if (t === 'MESSAGE_ACK') this.acked(str(d.channel_id), str(d.message_id), d.mention_count ?? 0);
    else if (t === 'GUILD_MEMBER_LIST_UPDATE') this.memberListUpdated(d);
    else if (t === 'VOICE_STATE_UPDATE') this.call.stateUpdate(d);
    else if (t === 'VOICE_SERVER_UPDATE') this.call.serverUpdate(d);
    else if (t === 'CALL_CREATE' || t === 'CALL_UPDATE' || t === 'CALL_DELETE') this.call.callUpdate(t, d);
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
    this.rules.load(d);
    if (Array.isArray(d.users)) for (const u of d.users) this.user(u);
    this.guilds = [];
    if (Array.isArray(d.guilds)) for (const g of d.guilds) if (g.unavailable !== true) {
      this.guilds.push(this.guild(g));
      if (Array.isArray(g.voice_states)) for (const v of g.voice_states) this.call.stateUpdate(v);   // who is in the voice channels
    }
    this.dms = [];
    if (Array.isArray(d.private_channels)) for (const c of d.private_channels) this.dms.push(this.channel(c, ''));
    this.sortDms();
    this.reads.clear();
    // VERSIONED_READ_STATES gives {entries}, older clients a list; NON_CHANNEL_READ_STATES adds entries of other types
    const rs: any = d.read_state;
    const entries: any = rs !== undefined && rs !== null && Array.isArray(rs.entries) ? rs.entries : rs;
    if (Array.isArray(entries)) for (const e of entries) if ((e.read_state_type ?? 0) === 0) {
      const r = new ReadState();
      r.lastId = str(e.last_message_id); r.mentions = e.mention_count ?? 0;
      this.reads.set(str(e.id), r);
      this.log(`read ${str(e.id)}: up to ${r.lastId}, ${r.mentions} mentions`);
    }
    this.log(`ready ${this.me.name}: ${this.guilds.length} servers, ${this.dms.length} DMs`);
    const shown = this.shownGuilds();
    if (this.channelId === '') this.selectGuild(shown.length > 0 ? shown[0].id : '');
  }
  private guild(g: any): Guild {
    const p: any = g.properties !== undefined && g.properties !== null ? g.properties : g;   // CLIENT_STATE_V2 puts the fields in properties
    const out = new Guild();
    out.id = str(g.id); out.name = str(p.name); out.icon = str(p.icon);
    const roles: any = Array.isArray(g.roles) ? g.roles : p.roles;
    if (Array.isArray(roles)) for (const r of roles) out.roles.set(str(r.id), str(r.name));
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
  userName(id: string): string { const u = this.users.get(id); return u !== undefined ? u.name : 'unknown-user'; }
  /** The user's avatar hash, '' when it has none. */
  avatarOf(id: string): string { const u = this.users.get(id); return u !== undefined ? u.avatar : ''; }
  roleName(id: string): string { const g = this.findGuild(this.guildId); const n = g !== null ? g.roles.get(id) : undefined; return n !== undefined ? n : 'unknown-role'; }
  findGuild(id: string): Guild | null { for (const g of this.guilds) if (g.id === id) return g; return null; }
  findChannel(id: string): Channel | null {
    for (const c of this.dms) if (c.id === id) return c;
    for (const g of this.guilds) for (const c of g.channels) if (c.id === id) return c;
    return null;
  }
  // ------------------------------------------------------------------ notifications
  /** Discord's rules, but never for a server switched off here nor for the channel shown in the focused window. */
  private notifies(d: any, c: Channel): boolean {
    if (c.guildId !== '') { const g = this.findGuild(c.guildId); if (g === null || !this.shown(g)) return false; }
    if (c.id === this.channelId && !this.settingsOpen && windowFocused()) return false;
    const yes = this.rules.notifies(d, where(c), Date.now());
    this.log(`notify ${c.id}: ${yes ? 'yes' : 'no'}`);
    return yes;
  }
  /** The mentions of the DMs and the servers shown: the Dock's badge. */
  totalMentions(): i32 { let n = this.dmMentions(); for (const g of this.shownGuilds()) n += this.guildMentions(g); return n; }
  /** Opens a channel (a notification clicked): its server, then the channel. */
  open(channelId: string): void {
    const c = this.findChannel(channelId);
    if (c === null) return;
    this.settingsOpen = false;
    if (this.guildId !== c.guildId) this.selectGuild(c.guildId);
    this.selectChannel(c.id);
  }

  // ------------------------------------------------------------------ the servers shown (the settings)
  /** A server switched off is out of the rail, so out of the unread and mention marks, and never opened, so never subscribed to. */
  shown(g: Guild): boolean { const a = this.allowed; return a === null || a.has(g.id); }
  shownGuilds(): Guild[] { return this.guilds.filter((g: Guild) => this.shown(g)); }
  /** Joined after the choice was made, and not listed by the settings since: off until switched on. */
  isNew(g: Guild): boolean { return this.allowed !== null && !this.known.has(g.id); }
  setShown(id: string, on: boolean): void {
    let a = this.allowed;
    if (a === null) {                                   // the first choice starts from every server on
      a = new Set<string>();
      for (const g of this.guilds) { a.add(g.id); this.known.add(g.id); }
      this.allowed = a;
    }
    if (on) a.add(id); else a.delete(id);
    this.saveServers();
    this.log(`servers shown: ${this.shownGuilds().map((g: Guild) => g.name).join(', ')}`);
    if (!on && this.guildId === id) this.selectGuild('');
    this.changed();
  }
  /** Every server on or off at once (then pick the few to keep). */
  setAllShown(on: boolean): void {
    const a = new Set<string>();
    for (const g of this.guilds) { this.known.add(g.id); if (on) a.add(g.id); }
    this.allowed = a;
    this.saveServers();
    this.log(`servers shown: ${this.shownGuilds().map((g: Guild) => g.name).join(', ')}`);
    if (this.guildId !== '' && !on) this.selectGuild('');
    this.changed();
  }
  /** Closing the settings: the servers they listed are no longer new. */
  showSettings(open: boolean): void {
    if (!open && this.allowed !== null) { for (const g of this.guilds) this.known.add(g.id); this.saveServers(); }
    this.settingsOpen = open; this.changed();
  }
  private saveServers(): void {
    const a = this.allowed;
    if (a !== null) storage.set(SERVERS_KEY, JSON.stringify({ allowed: sortedIds(a), known: sortedIds(this.known) }));
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
    if (Array.isArray(m.attachments)) for (const f of m.attachments) {
      const a = new Attachment();
      a.id = str(f.id); a.filename = str(f.filename); a.url = str(f.url); a.size = f.size ?? 0;
      if (str(f.content_type).startsWith('image/')) { a.width = f.width ?? 0; a.height = f.height ?? 0; }
      out.attachments.push(a);
    }
    const r: any = m.referenced_message;
    if (r !== undefined && r !== null) out.replyTo = `${this.user(r.author).name}: ${str(r.content).slice(0, 80)}`;
    out.nonce = typeof m.nonce === 'string' ? m.nonce : '';
    if (Array.isArray(m.mentions)) for (const u of m.mentions) out.mentions.push(this.user(u).id);
    out.mentionsEveryone = m.mention_everyone === true;
    return out;
  }
  private messageCreated(d: any): void {
    const m = this.message(d);
    const c = this.findChannel(m.channelId);
    if (c !== null) { c.lastMessageId = m.id; if (c.guildId === '') this.sortDms(); }
    this.stopTyping(m.channelId, m.authorId);
    // read state: what I write is read; another's message is read at once in the open channel, else counts when it is a DM or names me
    const rs = this.read(m.channelId);
    if (m.authorId === this.me.id) { rs.lastId = m.id; rs.mentions = 0; }
    else if (m.channelId === this.channelId) this.ackSoon(m.channelId);
    else if (c !== null && c.guildId === '' && !this.rules.muted(where(c), Date.now())) rs.mentions++;   // a DM counts unless muted
    else if (c !== null && this.rules.mentions(d, c.guildId)) rs.mentions++;
    if (c !== null && this.notifier !== null && this.notifies(d, c)) this.notifier(m, c);
    const list = this.messages.get(m.channelId);
    if (list === undefined) return;            // never opened: its history is fetched when it is
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === m.id) return;
      if (m.nonce !== '' && list[i].pending && list[i].nonce === m.nonce) { list[i] = m; this.log(`sent ${m.id}: ${m.content}`); return; }   // the echo of what I sent
    }
    list.push(m);
    this.log(`message in ${m.channelId} from ${m.author}: ${m.content}`);
  }
  private messageUpdated(d: any): void {
    const list = this.messages.get(str(d.channel_id));
    if (list === undefined) return;
    for (let i = 0; i < list.length; i++) if (list[i].id === str(d.id)) {
      if (d.author !== undefined) list[i] = this.message(d);      // a partial update (an embed resolved) keeps the message
      else if (typeof d.content === 'string') list[i].content = d.content;
      this.log(`edited ${list[i].id}: ${list[i].content}${list[i].edited ? ' (edited)' : ''}`);
      return;
    }
  }
  private messageDeleted(channelId: string, id: string): void {
    const list = this.messages.get(channelId);
    if (list !== undefined) this.messages.set(channelId, list.filter((m: Message) => m.id !== id));
    this.log(`deleted ${id}`);
  }

  // ------------------------------------------------------------------ navigation
  /** Shows a server's channels (or the DMs) without opening one: nothing is fetched or read until a conversation is chosen. */
  selectGuild(id: string): void {
    this.guildId = id;
    this.selectChannel('');
  }
  selectChannel(id: string): void {
    if (id !== this.channelId) { this.draft = ''; this.replyTo = null; this.editing = null; this.lastTypingAt = 0; }
    this.channelId = id;
    this.subscribe(id);
    this.changed();
    if (id !== '' && !this.messages.has(id)) this.loadHistory(id);
    else if (id !== '') this.ack(id);
  }
  private async loadHistory(id: string): Promise<void> {
    this.loading = true; this.changed();
    try {
      const page: any = await api('GET', `/channels/${id}/messages?limit=${MESSAGES_PAGE}`);
      const list: Message[] = [];
      if (Array.isArray(page)) for (let i = page.length - 1; i >= 0; i--) list.push(this.message(page[i]));   // newest first on the wire
      if (list.length < MESSAGES_PAGE) this.complete.add(id);
      const live = this.messages.get(id);                 // messages that arrived while the page loaded
      if (live !== undefined) for (const m of live) if (list.every((x: Message) => x.id !== m.id)) list.push(m);
      this.messages.set(id, list);
      this.log(`history ${id}: ${list.length} messages`);
      if (this.channelId === id) this.ack(id);
    } catch (e) {
      this.error = e instanceof ApiError && e.status === 403 ? 'You cannot read this channel.' : `Could not load the messages: ${e.message}`;
      this.log(`history ${id} failed: ${e.message}`);
    }
    this.loading = false; this.changed();
  }

  /** The page before the oldest message shown (the history scrolled to its top): how many came, 0 when none or one is on its way. */
  async loadOlder(): Promise<i32> {
    const ch = this.channelId, list = this.messages.get(ch);
    if (list === undefined || list.length === 0 || this.older !== '' || this.complete.has(ch)) return 0;
    this.older = ch;
    let n = 0;
    try {
      const page: any = await api('GET', `/channels/${ch}/messages?before=${list[0].id}&limit=${OLDER_PAGE}`);
      const add: Message[] = [];
      if (Array.isArray(page)) for (let i = page.length - 1; i >= 0; i--) add.push(this.message(page[i]));
      if (add.length < OLDER_PAGE) this.complete.add(ch);
      const now = this.messages.get(ch);
      if (now !== undefined && add.length > 0) { this.messages.set(ch, add.concat(now)); n = add.length; }
      this.log(`older ${ch}: ${add.length} messages`);
    } catch (e) { this.log(`older ${ch} failed: ${e.message}`); }
    this.older = '';
    if (n > 0) this.changed();
    return n;
  }
  /** The whole history of the channel is loaded. */
  allLoaded(ch: string): boolean { return this.complete.has(ch); }

  // ------------------------------------------------------------------ the member list
  /** Op 37 for a server's channel: its member list comes as GUILD_MEMBER_LIST_UPDATE. */
  private subscribe(id: string): void {
    const c = this.findChannel(id);
    if (c === null || c.guildId === '') return;
    this.members = []; this.membersOf = c.guildId;
    this.gateway.subscribe(subscription(c.guildId, id));
  }
  private memberListUpdated(d: any): void {
    if (str(d.guild_id) !== this.membersOf) return;
    applyMemberListUpdate(this.members, d, (u: any): string => this.user(u).id);
    this.log(`members ${this.membersOf}: ${this.members.map((r: MemberRow) => r.group !== '' ? `[${r.group} ${r.count}]` : `${this.userName(r.userId)}(${r.status})`).join(' ')}`);
  }

  // ------------------------------------------------------------------ writing
  /** The composer's text changed: Discord shows "typing" for 10 s, so it is sent again every 8 s while the person types. */
  typed(text: string): void {
    this.draft = text;
    if (text === '' || this.editing !== null || this.channelId === '') return;
    const now = Date.now();
    if (now - this.lastTypingAt < TYPING_EVERY_MS) return;
    this.lastTypingAt = now;
    api('POST', `/channels/${this.channelId}/typing`).catch((e) => { this.log(`typing failed: ${e.message}`); });
  }
  reply(m: Message): void { this.editing = null; this.replyTo = m; this.changed(); }
  /** Edits m in the composer (Up in an empty composer edits my last message). */
  edit(m: Message): void { this.replyTo = null; this.editing = m; this.draft = m.content; this.changed(); }
  cancel(): void { if (this.editing !== null) this.draft = ''; this.replyTo = null; this.editing = null; this.changed(); }
  lastOwn(): Message | null {
    const list = this.messages.get(this.channelId);
    if (list !== undefined) for (let i = list.length - 1; i >= 0; i--) if (list[i].authorId === this.me.id && !list[i].pending) return list[i];
    return null;
  }
  /** Sends the composer: a new message (with a nonce, shown at once and replaced by the server's echo), a reply, or an edit. */
  async send(): Promise<void> {
    const text = this.draft.trim(), ch = this.channelId;
    if (text === '' || ch === '') return;
    if (text.length > MESSAGE_MAX) { this.error = `A message holds ${MESSAGE_MAX} characters at most.`; this.changed(); return; }
    const editing = this.editing, replyTo = this.replyTo;
    this.draft = ''; this.editing = null; this.replyTo = null; this.lastTypingAt = 0; this.error = '';
    if (editing !== null) {
      this.changed();
      if (text === editing.content) return;
      try { await api('PATCH', `/channels/${ch}/messages/${editing.id}`, { content: text }); }
      catch (e) { this.error = `Could not edit the message: ${e.message}`; this.changed(); }
      return;
    }
    const m = this.pendingMessage(ch, text);
    const body: any = { content: text, nonce: m.nonce, tts: false, flags: 0 };
    if (replyTo !== null) {
      m.replyTo = `${replyTo.author}: ${replyTo.content.slice(0, 80)}`;
      body.message_reference = { message_id: replyTo.id, channel_id: ch };
    }
    await this.post(ch, m, body, []);
  }
  /** Sends files picked or dropped, with the composer's text (Discord's cloud upload: services/upload.ts). */
  async sendFiles(paths: string[]): Promise<void> {
    const ch = this.channelId;
    if (ch === '' || paths.length === 0) return;
    if (paths.length > UPLOAD_MAX) { this.error = `A message holds ${UPLOAD_MAX} files at most.`; this.changed(); return; }
    const files: Upload[] = [];
    try { for (const p of paths) files.push(readUpload(p)); }
    catch (e) { this.error = `Could not read the file: ${e.message}`; this.changed(); return; }
    const text = this.draft.trim();
    this.draft = ''; this.replyTo = null; this.editing = null; this.error = '';
    const m = this.pendingMessage(ch, text);
    for (const f of files) { const a = new Attachment(); a.filename = f.filename; a.size = f.bytes.length; m.attachments.push(a); }
    await this.post(ch, m, { content: text, nonce: m.nonce, tts: false, flags: 0 }, files);
  }
  private pendingMessage(ch: string, text: string): Message {
    const m = new Message();
    m.nonce = snowflakeNow(); m.pending = true; m.channelId = ch; m.authorId = this.me.id; m.author = this.me.name; m.content = text;
    m.timestamp = new Date().toISOString();
    return m;
  }
  /** Shows m at once, uploads its files, sends it; the server's echo (found by the nonce) replaces it. */
  private async post(ch: string, m: Message, body: any, files: Upload[]): Promise<void> {
    const list = this.messages.get(ch);
    if (list !== undefined) list.push(m);
    this.changed();
    try {
      if (files.length > 0) {
        body.attachments = await uploadFiles(ch, files);
        this.log(`uploaded ${files.map((f: Upload) => f.filename).join(', ')}`);
      }
      const d: any = await api('POST', `/channels/${ch}/messages`, body);
      if (d !== null && m.pending) { this.messageCreated(d); this.changed(); }
    } catch (e) {
      m.pending = false; m.failed = true;
      this.error = `Could not send the message: ${e.message}`;
      this.changed();
    }
  }
  async remove(m: Message): Promise<void> {
    if (m.pending) return;
    if (m.failed) { this.messageDeleted(m.channelId, m.id); this.changed(); return; }
    try { await api('DELETE', `/channels/${m.channelId}/messages/${m.id}`); }
    catch (e) { this.error = `Could not delete the message: ${e.message}`; this.changed(); }
  }
  revealSpoilers(m: Message): void { this.revealed.add(m.id); this.changed(); }

  // ------------------------------------------------------------------ typing
  private typingStarted(d: any): void {
    const ch = str(d.channel_id), id = str(d.user_id);
    if (id === this.me.id) return;
    let name = '';
    const member: any = d.member;
    if (member !== undefined && member !== null && member.user !== undefined) name = this.user(member.user).name;
    else { const u = this.users.get(id); name = u !== undefined ? u.name : 'Someone'; }
    const known = this.typists.get(ch);
    const list = known !== undefined ? known.filter((t: Typist) => t.userId !== id) : [];
    const t = new Typist();
    t.userId = id; t.name = name; t.until = Date.now() + TYPING_SHOWN_MS;
    list.push(t);
    this.typists.set(ch, list);
    this.log(`typing in ${ch}: ${name}`);
    this.expireTyping();
  }
  private stopTyping(ch: string, userId: string): void {
    const list = this.typists.get(ch);
    if (list !== undefined) this.typists.set(ch, list.filter((t: Typist) => t.userId !== userId));
  }
  /** Drops the indicators that ran out, and comes back when the next one does (no timer while nobody types). */
  private expireTyping(): void {
    if (this.typingTimer >= 0) { clearTimeout(this.typingTimer); this.typingTimer = -1; }
    const now = Date.now();
    let next: number = 0;
    this.typists.forEach((list: Typist[], ch: string): void => {
      const left = list.filter((t: Typist) => t.until > now);
      this.typists.set(ch, left);
      for (const t of left) if (next === 0 || t.until < next) next = t.until;
    });
    if (next > 0) this.typingTimer = setTimeout(() => { this.typingTimer = -1; this.expireTyping(); this.changed(); }, next - now);
  }
  /** "Grace is typing…" for the channel, '' when nobody is. */
  typingText(ch: string): string {
    const list = this.typists.get(ch);
    if (list === undefined || list.length === 0) return '';
    if (list.length === 1) return `${list[0].name} is typing…`;
    if (list.length <= 3) return `${list.slice(0, list.length - 1).map((t: Typist) => t.name).join(', ')} and ${list[list.length - 1].name} are typing…`;
    return 'Several people are typing…';
  }

  // ------------------------------------------------------------------ read state
  private read(ch: string): ReadState {
    const known = this.reads.get(ch);
    if (known !== undefined) return known;
    const r = new ReadState();
    const c = this.findChannel(ch);
    if (c !== null) r.lastId = c.lastMessageId;                // no read state yet: nothing to read
    this.reads.set(ch, r);
    return r;
  }
  /** The channel has messages after the last one read. */
  unread(ch: string): boolean {
    const c = this.findChannel(ch);
    return c !== null && c.lastMessageId !== '' && compareIds(c.lastMessageId, this.read(ch).lastId) > 0;
  }
  mentions(ch: string): i32 { return this.read(ch).mentions; }
  guildMentions(g: Guild): i32 { let n = 0; for (const c of g.channels) n += this.mentions(c.id); return n; }
  guildUnread(g: Guild): boolean { return g.channels.some((c: Channel) => c.readable() && this.unread(c.id)); }
  dmMentions(): i32 { let n = 0; for (const c of this.dms) n += this.mentions(c.id); return n; }
  /** MESSAGE_ACK: read here or on another device. */
  private acked(ch: string, messageId: string, mentionCount: i32): void {
    const r = this.read(ch);
    if (messageId !== '' && compareIds(messageId, r.lastId) >= 0) r.lastId = messageId;
    r.mentions = mentionCount;
    this.log(`read ${ch}: up to ${r.lastId}, ${r.mentions} mentions`);
  }
  /** Marks the channel read up to its last message when it is not, as the web client does when it shows it. */
  private ack(ch: string): void {
    const c = this.findChannel(ch);
    if (c === null || !this.unread(ch)) return;          // read already: no request
    const r = this.read(ch);
    r.lastId = c.lastMessageId; r.mentions = 0;
    const lastViewed = Math.floor((Date.now() - DISCORD_EPOCH) / 86400000);
    api('POST', `/channels/${ch}/messages/${c.lastMessageId}/ack`, { token: null, last_viewed: lastViewed })
      .catch((e) => { this.log(`ack failed: ${e.message}`); });
  }
  /** Messages that arrive in the open channel are read: one ack for a burst. */
  private ackSoon(ch: string): void {
    if (this.ackTimer >= 0) return;
    this.ackTimer = setTimeout(() => { this.ackTimer = -1; this.ack(ch); }, ACK_DELAY_MS);
  }
}

/** A snowflake for now, as the web client's nonces: (ms since 2015) << 22, in decimal without BigInt (the low half carries). */
function snowflakeNow(): string {
  const ms = Math.max(0, Date.now() - DISCORD_EPOCH), hi = Math.floor(ms / 10000000), lo = ms % 10000000;
  const low = lo * 4194304, carry = Math.floor(low / 10000000), rest = `${low % 10000000}`;
  return `${hi * 4194304 + carry}${'0'.repeat(7 - rest.length)}${rest}`;
}

/** A channel as the notification rules see it. */
function where(c: Channel): Where { const w = new Where(); w.id = c.id; w.guildId = c.guildId; w.type = c.type; w.parentId = c.parentId; return w; }

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
