// The app's state and its actions: the user, the servers and their channels, the DMs, the open channel and its messages. The gateway's
// dispatches and the REST answers land here; the screen reads these fields and re-renders when changed() calls it back. No drawing.
import { Gateway, GatewayHandler } from './services/gateway';
import { ApiError } from './services/rest';
import * as guard from './safety/index';
import { loadToken, saveToken, forgetToken } from './services/session';
import { onPicture, cacheFolder } from './services/cdn';
import { Upload, readUpload, uploadFiles } from './services/upload';
import { MemberRow, subscription, applyMemberListUpdate, ranges, mobileOnly } from './members';
import { CH_TEXT, CH_DM, CH_GROUP_DM, CH_CATEGORY, CH_ANNOUNCEMENT, CH_FORUM, CH_MEDIA, isThread, MESSAGES_PAGE, OLDER_PAGE, TYPING_SHOWN_MS, DISCORD_EPOCH } from './constants';
import { env } from 'zinc:sys';
import * as storage from 'zinc:storage';
import { windowFocused } from 'zinc:ui';
import { NotifyRules, Where } from './notify';
import { Call } from './call';
import { Embed, Reaction, Sticker, Poll, Component, ThreadRef, embeds, reactions, stickers, poll, pollVoted, componentRows, threadRef,
  interactionLine, systemText, reactionAdded, reactionRemoved, reactionPath, T_THREAD_STARTER } from './content';

export class User { id = ''; name = ''; avatar = ''; }
export class Channel {
  id = ''; guildId = ''; type: i32 = CH_TEXT; name = ''; position: i32 = 0; parentId = ''; lastMessageId = '';
  /** A thread: its count of messages and its tags (ids); a forum: the names of its tags by id. */
  messageCount: i32 = 0; tags: string[] = []; tagNames: Map<string, string> = new Map<string, string>();
  /** A DM: the other person (their avatar and presence). */
  recipientId = '';
  /** Text channels, threads and DMs open in the message view, forums as their list of posts; voice and categories are shown only. */
  readable(): boolean { return this.type === CH_TEXT || this.type === CH_ANNOUNCEMENT || this.type === CH_DM || this.type === CH_GROUP_DM || isThread(this.type) || this.forum(); }
  forum(): boolean { return this.type === CH_FORUM || this.type === CH_MEDIA; }
}
export class Guild {
  id = ''; name = ''; icon = ''; channels: Channel[] = []; roles: Map<string, string> = new Map<string, string>();
  /** The roles' colours (0: none) and positions: a member's name takes the colour of their highest coloured role. */
  roleColors: Map<string, i32> = new Map<string, i32>(); rolePositions: Map<string, i32> = new Map<string, i32>();
}
/** Someone's presence: 'online', 'idle', 'dnd' or 'offline', and on a phone only. */
export class Presence { status = 'offline'; mobile = false; }
/** A file of a message: an image is shown (its size known before it loads, so the list does not jump), a video as its first frame, a sound
 *  or a voice message with its length, another file as a link with its size. */
export class Attachment {
  id = ''; filename = ''; url = ''; width: i32 = 0; height: i32 = 0; size: i32 = 0;
  /** image, video, audio, voice or file; Discord's resizing copy (the media proxy); the alt text; hidden until clicked. */
  kind = 'file'; proxyUrl = ''; description = ''; spoiler = false;
  /** A voice message: its seconds and its waveform (base64, a byte a sample). */
  duration: number = 0; waveform = '';
  image(): boolean { return this.kind === 'image' && this.width > 0 && this.height > 0 && this.url !== ''; }
}
export class Message {
  id = ''; channelId = ''; authorId = ''; author = ''; content = ''; timestamp = ''; edited = false;
  attachments: Attachment[] = []; replyTo = '';
  /** The id of the message it answers ('' none: a jump goes there) and whether it is pinned. */
  replyId = ''; pinned = false;
  /** Sent from here: the nonce that finds the server's echo; pending until the answer or the echo comes, failed when it was refused. */
  nonce = ''; pending = false; failed = false;
  /** Who it mentions (user ids) and whether it mentions everyone. */
  mentions: string[] = []; mentionsEveryone = false;
  /** What else it carries (content.ts): its type and flags, written by a bot, the sentence of a system message, "Grace used /roll", a reply
   *  to a deleted message, embeds, reactions, stickers, a poll, rows of buttons, its thread, and the message it forwards. */
  type: i32 = 0; flags: i32 = 0; bot = false; system = ''; interaction = ''; replyDeleted = false;
  embeds: Embed[] = []; reactions: Reaction[] = []; stickers: Sticker[] = []; poll: Poll | null = null; rows: Component[][] = [];
  thread: ThreadRef | null = null; forwarded: Message | null = null;
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
  private subscribedTo = '';    // the channel op 37 last asked for on this session: asked again only when it changes
  private subscribedRanges = '';   // and the ranges of its member list it asked for (the rows on screen)
  /** Presences by user: READY's, PRESENCE_UPDATE's and the member list's. */
  presences: Map<string, Presence> = new Map<string, Presence>();
  /** The settings screen is open (in place of the messages). */
  settingsOpen = false;
  /** The settings' pane: 'servers', 'voice' (Voice & audio) or 'appearance' (the themes). */
  settingsTab = 'servers';
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
  private users: Map<string, User> = new Map<string, User>();
  private gateway: Gateway;
  /** The voice call (call.ts). */
  call: Call;
  private listeners: (() => void)[] = [];
  private logging = env('DISCORD_LOG') === '1';

  constructor() {
    this.gateway = new Gateway(this);
    this.call = new Call((): string => this.me.id, (g: string, c: string, mute: boolean, deaf: boolean, video: boolean): void => { this.voiceState(g, c, mute, deaf, video); },
      (): void => { this.changed(); }, (line: string): void => { this.log(line); }, (op: i32, d: any): void => { this.stream(op, d); });
    guard.setLog((line: string): void => { this.log(line); });
    guard.onChange((): void => { this.changed(); });
    guard.onSafeMode((message: string, unauthorized: boolean): void => { if (unauthorized) this.authFailed(); else { this.error = message; this.changed(); } });
    guard.keepReadyIn(`${cacheFolder()}/.ready.json`);   // a dot file: the cache's listing of pictures does not show it
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
    if (t === '') return;
    const last = guard.lastSession();   // the last launch left a session a moment ago: READY read back, then RESUME
    if (last === null) { this.connect(t, null); return; }
    this.log('session: resumed from the last launch');
    this.dispatch('READY', last[1]);
    guard.observe('READY', last[1]);
    this.connect(t, last[0] as guard.Saved);
  }
  /** Quitting (every way out of the app comes here): the session is kept for a quick restart. */
  suspend(): void {
    guard.keepSession(this.gateway.saved());
    this.gateway.suspend();
  }
  async login(token: string): Promise<void> {
    const t = token.trim();
    if (t === '') { this.error = 'Paste your token first.'; this.changed(); return; }
    this.error = '';
    guard.forgetSession();
    if (env('DISCORD_TOKEN') === '') {
      try { await saveToken(t); } catch (e) { this.error = `The token could not be kept in the keychain: ${e.message}`; this.changed(); return; }
    }
    this.connect(t, null);
  }
  async logout(): Promise<void> {
    this.call.leave();
    this.gateway.stop();
    guard.forgetSession();
    if (env('DISCORD_TOKEN') === '') try { await forgetToken(); } catch (e) {}   // a test's token was never in the keychain
    this.guilds = []; this.dms = []; this.messages.clear(); this.users.clear(); this.reads.clear(); this.typists.clear(); this.guildId = ''; this.channelId = '';
    this.members = []; this.membersOf = ''; this.complete.clear();
    this.stage = 'login'; this.changed();
  }
  /** Drops the gateway connection (tests): it must resume. */
  dropConnection(): void { this.gateway.drop(); }
  private connect(token: string, resume: guard.Saved | null): void { guard.setToken(token); this.gateway.start(token, resume); }
  /** Op 4 for the call: joining, muting, deafening go through the guard; leaving always goes. */
  private voiceState(guildId: string, channelId: string, mute: boolean, deaf: boolean, video: boolean): void {
    const d: any = { guild_id: guildId !== '' ? guildId : null, channel_id: channelId !== '' ? channelId : null, self_mute: mute, self_deaf: deaf, self_video: video };
    if (channelId === '') guard.leave(4, d); else guard.send(guard.begin('voice'), 4, d);
  }
  /** Go Live's ops for the call: 18 (our stream), 20 (watch one), 22 (paused or not) go through the guard; 19 (ending one) always goes. */
  private stream(op: i32, d: any): void {
    if (op === 19) guard.leave(op, d);
    else if (op === 18 || op === 20 || op === 22) guard.send(guard.begin('stream'), op, d);
  }
  /** Joins a voice channel or a DM call (pressed in the channel list), when the guard lets it: not a full channel, not without CONNECT;
   *  without SPEAK the call starts muted. */
  async joinCall(channelId: string, guildId: string): Promise<void> {
    if (this.call.channelId === channelId) return;
    const d = new guard.Details();
    d.channel = channelId; d.inCall = this.call.members(channelId).length;
    const v = guard.begin('call', d, 0);
    if (!v.ok) { this.refuse(v.message); return; }
    if (guard.mustMute(channelId)) this.call.mute = true;
    await this.call.join(channelId, guildId);
  }
  /** What the guard refused, shown where errors show. */
  private refuse(message: string): void { this.error = message; this.changed(); }

  // ------------------------------------------------------------------ GatewayHandler
  status(s: string): void {
    if (s === this.stage) return;
    if (s === 'connecting' || s === 'ready' || s === 'reconnecting' || s === 'failed') { this.stage = s; this.log(`stage ${s}`); this.changed(); }
  }
  authFailed(): void {
    this.log('auth failed');
    this.gateway.stop();
    if (env('DISCORD_TOKEN') === '') forgetToken().catch((): void => {});
    guard.forgetSession();
    this.stage = 'login'; this.error = 'Discord refused this token: log in again.'; this.changed();
  }
  dispatch(t: string, d: any): void {
    if (t === 'READY') this.ready(d);
    else if (t === 'RESUMED') this.subscribedTo = '';   // the next view of a channel asks for its member list again, once
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
    else if (t === 'MESSAGE_DELETE_BULK') { if (Array.isArray(d.ids)) for (const id of d.ids) this.messageDeleted(str(d.channel_id), str(id)); }
    else if (t.startsWith('MESSAGE_REACTION_')) this.reacted(t, d);
    else if (t === 'MESSAGE_POLL_VOTE_ADD' || t === 'MESSAGE_POLL_VOTE_REMOVE') this.pollVote(t === 'MESSAGE_POLL_VOTE_ADD', d);
    else if (t === 'THREAD_CREATE' || t === 'THREAD_UPDATE') this.putChannel(this.channel(d, str(d.guild_id)));
    else if (t === 'THREAD_DELETE') this.removeChannel(str(d.id));
    else if (t === 'THREAD_LIST_SYNC') { if (Array.isArray(d.threads)) for (const c of d.threads) this.putChannel(this.channel(c, str(d.guild_id))); }
    else if (t === 'TYPING_START') this.typingStarted(d);
    else if (t === 'MESSAGE_ACK') this.acked(str(d.channel_id), str(d.message_id), d.mention_count ?? 0);
    else if (t === 'GUILD_MEMBER_LIST_UPDATE') this.memberListUpdated(d);
    else if (t === 'PRESENCE_UPDATE') this.presenceUpdated(d);
    else if (t === 'CHANNEL_PINS_UPDATE') { if (!this.pinning.delete(str(d.channel_id))) this.pins.delete(str(d.channel_id)); }   // pinned elsewhere: asked again when the pins are opened
    else if (t === 'VOICE_STATE_UPDATE') this.call.stateUpdate(d);
    else if (t === 'VOICE_SERVER_UPDATE') this.call.serverUpdate(d);
    else if (t === 'CALL_CREATE' || t === 'CALL_UPDATE' || t === 'CALL_DELETE') this.call.callUpdate(t, d);
    else if (t.startsWith('STREAM_')) this.call.streamEvent(t, d);
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
    this.subscribedTo = '';
    this.me = this.user(d.user);
    this.call.nitro = typeof d.user.premium_type === 'number' && d.user.premium_type > 0;   // Go Live above 720p 30 fps
    this.rules.load(d);
    if (Array.isArray(d.users)) for (const u of d.users) this.user(u);
    this.guilds = [];
    if (Array.isArray(d.guilds)) for (let i = 0; i < d.guilds.length; i++) if (d.guilds[i].unavailable !== true) {
      const g: any = d.guilds[i], out = this.guild(g);   // what I may do there: the guard's permissions (safety/access.ts)
      this.guilds.push(out);
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
    // the presences of friends and DM recipients (merged_presences), or the older list
    this.presences.clear();
    const mp: any = d.merged_presences;
    const friends: any = mp !== undefined && mp !== null && Array.isArray(mp.friends) ? mp.friends : d.presences;
    if (Array.isArray(friends)) for (const p of friends) this.presenceUpdated(p);
    this.log(`ready ${this.me.name}: ${this.guilds.length} servers, ${this.dms.length} DMs`);
    const shown = this.shownGuilds();
    if (this.channelId === '') this.selectGuild(shown.length > 0 ? shown[0].id : '');
  }
  private guild(g: any): Guild {
    const p: any = g.properties !== undefined && g.properties !== null ? g.properties : g;   // CLIENT_STATE_V2 puts the fields in properties
    const out = new Guild();
    out.id = str(g.id); out.name = str(p.name); out.icon = str(p.icon);
    const roles: any = Array.isArray(g.roles) ? g.roles : p.roles;
    if (Array.isArray(roles)) for (const r of roles) {
      out.roles.set(str(r.id), str(r.name));
      out.roleColors.set(str(r.id), r.color ?? 0); out.rolePositions.set(str(r.id), r.position ?? 0);
    }
    if (Array.isArray(g.channels)) for (const c of g.channels) out.channels.push(this.channel(c, out.id));
    if (Array.isArray(g.threads)) for (const c of g.threads) out.channels.push(this.channel(c, out.id));   // the active threads
    sortChannels(out.channels);
    return out;
  }
  private channel(c: any, guildId: string): Channel {
    const out = new Channel();
    out.id = str(c.id); out.guildId = guildId; out.type = c.type; out.position = c.position ?? 0;
    out.parentId = str(c.parent_id); out.lastMessageId = str(c.last_message_id); out.name = str(c.name);
    out.messageCount = c.message_count ?? 0;
    if (Array.isArray(c.applied_tags)) for (const t of c.applied_tags) out.tags.push(str(t));
    if (Array.isArray(c.available_tags)) for (const t of c.available_tags) out.tagNames.set(str(t.id), str(t.name));
    if (out.name === '' && (out.type === CH_DM || out.type === CH_GROUP_DM)) {
      const names: string[] = [];
      if (Array.isArray(c.recipients)) for (const r of c.recipients) { names.push(this.user(r).name); if (out.recipientId === '') out.recipientId = str(r.id); }
      if (Array.isArray(c.recipient_ids)) for (const id of c.recipient_ids) {
        const u = this.users.get(str(id)); if (u !== undefined) names.push(u.name);
        if (out.recipientId === '') out.recipientId = str(id);
      }
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
    this.settingsOpen = open;
    this.call.meterOn(open && this.settingsTab === 'voice');
    this.changed();
  }
  showSettingsTab(tab: string): void {
    this.settingsTab = tab;
    this.call.meterOn(this.settingsOpen && tab === 'voice');
    this.changed();
  }
  private saveServers(): void {
    const a = this.allowed;
    if (a !== null) storage.set(SERVERS_KEY, JSON.stringify({ allowed: sortedIds(a), known: sortedIds(this.known) }));
  }

  /** The channels of the open server, or the DMs. */
  channels(): Channel[] { const g = this.findGuild(this.guildId); return g !== null ? g.channels : this.dms; }

  // ------------------------------------------------------------------ messages
  private message(m: any): Message {
    const r: any = m.referenced_message;
    if (m.type === T_THREAD_STARTER && r !== undefined && r !== null) {   // a thread's first row: the message it was started from
      const s = this.message(r);
      s.id = str(m.id); s.channelId = str(m.channel_id); s.type = T_THREAD_STARTER;
      return s;
    }
    const out = new Message();
    out.id = str(m.id); out.channelId = str(m.channel_id); out.content = str(m.content); out.timestamp = str(m.timestamp);
    out.edited = str(m.edited_timestamp) !== '';
    if (m.author !== undefined && m.author !== null) {                  // a forwarded message's copy has none
      const a = this.user(m.author);
      out.authorId = a.id; out.author = a.name; out.bot = m.author.bot === true;
    }
    out.attachments = attachments(m.attachments);
    const ref: any = m.message_reference;
    const reply = ref !== undefined && ref !== null && (ref.type ?? 0) === 0 && (m.type === 19 || m.type === 20 || m.type === 23);
    if (r !== undefined && r !== null) out.replyTo = `${this.user(r.author).name}: ${replyText(r)}`;
    else if (r === null && reply) { out.replyTo = 'Original message was deleted'; out.replyDeleted = true; }
    if (reply || r !== undefined && r !== null) out.replyId = ref !== undefined && ref !== null ? str(ref.message_id) : str(r.id);
    out.pinned = m.pinned === true;
    out.nonce = typeof m.nonce === 'string' ? m.nonce : '';
    if (Array.isArray(m.mentions)) for (const u of m.mentions) out.mentions.push(this.user(u).id);
    out.mentionsEveryone = m.mention_everyone === true;
    out.type = m.type ?? 0; out.flags = m.flags ?? 0;
    this.content(out, m);
    out.interaction = interactionLine(m, (u: any): string => this.user(u).name);
    const g = this.findGuild(str(m.guild_id) !== '' ? str(m.guild_id) : this.guildId);
    out.system = systemText(m, out.author, out.mentions.length > 0 ? this.userName(out.mentions[0]) : '', g !== null ? g.name : '', this.me.id);
    const snaps: any = m.message_snapshots;
    if (ref !== undefined && ref !== null && ref.type === 1 && Array.isArray(snaps) && snaps.length > 0) {
      const f = this.message(snaps[0].message);
      f.id = out.id + '-fwd'; f.channelId = str(ref.channel_id);
      out.forwarded = f;
    }
    return out;
  }
  /** The fields an update can change without the rest (an embed resolved, a poll's results, a thread's count). */
  private content(out: Message, m: any): void {
    if (m.embeds !== undefined) out.embeds = embeds(m.embeds);
    if (m.reactions !== undefined) out.reactions = reactions(m.reactions);
    if (m.sticker_items !== undefined) out.stickers = stickers(m.sticker_items);
    if (m.poll !== undefined) out.poll = poll(m.poll);
    if (m.components !== undefined) out.rows = componentRows(m.components);
    if (m.thread !== undefined) out.thread = threadRef(m.thread);
  }
  private messageCreated(d: any): void {
    const m = this.message(d);
    const c = this.findChannel(m.channelId);
    if (c !== null) { c.lastMessageId = m.id; if (c.guildId === '') this.sortDms(); }
    this.stopTyping(m.channelId, m.authorId);
    // read state: what I write is read; another's message is read at once in the open channel, else counts when it is a DM or names me
    const rs = this.read(m.channelId);
    if (m.authorId === this.me.id) { rs.lastId = m.id; rs.mentions = 0; }
    else if (m.channelId === this.channelId && this.atEnd && !this.detached.has(m.channelId) || m.channelId === this.threadId) this.ackSoon(m.channelId);
    else if (m.channelId === this.channelId) this.newWhileUp++;   // scrolled up: the banner counts it, the end acks it
    else if (c !== null && c.guildId === '' && !this.rules.muted(where(c), Date.now())) rs.mentions++;   // a DM counts unless muted
    else if (c !== null && this.rules.mentions(d, c.guildId)) rs.mentions++;
    if (c !== null && this.notifier !== null && this.notifies(d, c)) this.notifier(m, c);
    const list = this.messages.get(m.channelId);
    if (list === undefined || this.detached.has(m.channelId)) return;   // never opened, or showing older messages: fetched when it is
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
      const was = list[i];
      if (d.author !== undefined) {                                // a whole message, but without its reactions
        list[i] = this.message(d);
        if (d.reactions === undefined) list[i].reactions = was.reactions;
      } else {                                                     // a partial update (an embed resolved, a poll ended) keeps the rest
        if (typeof d.content === 'string') was.content = d.content;
        if (typeof d.flags === 'number') was.flags = d.flags;
        if (typeof d.pinned === 'boolean') was.pinned = d.pinned;
        if (d.attachments !== undefined) was.attachments = attachments(d.attachments);
        this.content(was, d);
      }
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
    if (id !== this.channelId) {
      this.draft = ''; this.replyTo = null; this.editing = null;
      this.newFrom = id !== '' && this.unread(id) ? this.read(id).lastId : ''; this.atEnd = true; this.newWhileUp = 0; this.jumpId = '';
      this.pane = 'members'; this.threadId = '';                  // the pins or the thread beside were the last channel's
    }
    this.channelId = id;
    this.subscribe(id);
    this.changed();
    const c = this.findChannel(id);
    if (c !== null && c.forum()) { if (!this.postsOf.has(id)) this.loadPosts(c); }
    else if (c !== null && !c.readable()) { /* a voice channel: its call shows (App.tsx) */ }
    else if (id !== '' && !this.messages.has(id)) this.loadHistory(id);
    else if (id !== '') this.ack(id);
  }

  // ------------------------------------------------------------------ forums
  /** The first message of each forum post (its preview), by thread id. */
  previews: Map<string, Message> = new Map<string, Message>();
  private postsOf: Set<string> = new Set<string>();
  /** A forum's posts: its threads, the latest active first. */
  posts(forumId: string): Channel[] {
    const g = this.findGuild(this.guildId);
    if (g === null) return [];
    return g.channels.filter((c: Channel) => c.parentId === forumId && isThread(c.type)).sort((a: Channel, b: Channel) => compareIds(b.lastMessageId, a.lastMessageId));
  }
  /** The open posts of a forum, as the web client asks for them (threads/search), with their first messages. */
  private async loadPosts(forum: Channel): Promise<void> {
    this.loading = true; this.changed();
    try {
      const r: any = await guard.api('posts', 'GET', `/channels/${forum.id}/threads/search?archived=false&sort_by=last_message_time&sort_order=desc&limit=25&offset=0`, undefined);
      if (r !== null && Array.isArray(r.threads)) for (const t of r.threads) this.putChannel(this.channel(t, forum.guildId));
      if (r !== null && Array.isArray(r.first_messages)) for (const m of r.first_messages) this.previews.set(str(m.channel_id), this.message(m));
      this.postsOf.add(forum.id);
      this.log(`posts ${forum.id}: ${this.posts(forum.id).map((c: Channel) => `${c.name} [${c.tags.map((t: string) => forum.tagNames.get(t) ?? t).join(',')}] ${c.messageCount}`).join('; ')}`);
    } catch (e) { this.error = `Could not load the posts: ${e.message}`; }
    this.loading = false; this.changed();
  }
  private async loadHistory(id: string): Promise<void> {
    this.loading = true; this.changed();
    try {
      const page: any = await guard.api('history', 'GET', `/channels/${id}/messages?limit=${MESSAGES_PAGE}`, undefined);
      const list: Message[] = [];
      if (Array.isArray(page)) for (let i = page.length - 1; i >= 0; i--) list.push(this.message(page[i]));   // newest first on the wire
      if (list.length < MESSAGES_PAGE) this.complete.add(id);
      const live = this.messages.get(id);                 // messages that arrived while the page loaded
      if (live !== undefined) for (const m of live) if (list.every((x: Message) => x.id !== m.id)) list.push(m);
      this.messages.set(id, list);
      this.log(`history ${id}: ${list.length} messages`);
      if (this.channelId === id || this.threadId === id) this.ack(id);
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
      const page: any = await guard.api('older', 'GET', `/channels/${ch}/messages?before=${list[0].id}&limit=${OLDER_PAGE}`, undefined);
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
    if (c === null || c.guildId === '' || id === this.subscribedTo) return;
    this.members = []; this.membersOf = c.guildId; this.subscribedTo = id; this.subscribedRanges = '';
    this.memberRows(0, 0);
  }
  /** The member list shows rows first..last: op 37 asks for their ranges when they are not the ones asked for already (the list scrolled
   *  to another hundred). */
  memberRows(first: i32, last: i32): void {
    const c = this.findChannel(this.subscribedTo);
    const rs = ranges(first, last), key = JSON.stringify(rs);
    if (c === null || key === this.subscribedRanges) return;
    if (!guard.send(guard.begin('subscribe'), 37, subscription(c.guildId, c.id, rs))) return;   // refused: asked again at the next scroll
    this.subscribedRanges = key;
  }
  private memberListUpdated(d: any): void {
    if (str(d.guild_id) !== this.membersOf) return;
    applyMemberListUpdate(this.members, d, (u: any): string => this.user(u).id, (r: MemberRow): void => {
      const p = this.presence(r.userId); p.status = r.status; p.mobile = r.mobile;
    });
    const known = this.members.filter((r: MemberRow) => r.known);
    this.log(`members ${this.membersOf}: ${known.slice(0, 12).map((r: MemberRow) => r.group !== '' ? `[${this.groupName(r.group)} ${r.count}]` : `${r.nick !== '' ? r.nick : this.userName(r.userId)}(${r.status}${r.mobile ? ' mobile' : ''}${this.roleColor(r) !== 0 ? ' coloured' : ''})`).join(' ')}${known.length > 12 ? ' …' : ''}, ${known.length} of ${this.members.length} rows`);
  }
  /** A header's name: a role's, Online or Offline. */
  groupName(id: string): string { return id === 'online' ? 'Online' : id === 'offline' ? 'Offline' : this.roleName(id); }
  /** The colour of a member's name: that of their highest role with one, 0 when none. */
  roleColor(r: MemberRow): i32 {
    const g = this.findGuild(this.membersOf);
    let best = -1, color = 0;
    if (g !== null) for (const id of r.roles) {
      const c = g.roleColors.get(id) ?? 0, pos = g.rolePositions.get(id) ?? 0;
      if (c !== 0 && pos > best) { best = pos; color = c; }
    }
    return color;
  }
  private presence(userId: string): Presence {
    const known = this.presences.get(userId);
    if (known !== undefined) return known;
    const p = new Presence();
    this.presences.set(userId, p);
    return p;
  }
  /** Someone's presence, 'offline' when none is known. */
  presenceOf(userId: string): Presence { const p = this.presences.get(userId); return p !== undefined ? p : new Presence(); }
  /** PRESENCE_UPDATE (and READY's): a friend's or a DM's status, from any server or none. */
  private presenceUpdated(d: any): void {
    const id = d.user !== undefined && d.user !== null ? str(d.user.id) : str(d.user_id);
    if (id === '') return;
    const p = this.presence(id);
    p.status = str(d.status) !== '' ? str(d.status) : 'offline'; p.mobile = mobileOnly(d.client_status);
    this.log(`presence ${this.userName(id)}: ${p.status}${p.mobile ? ' mobile' : ''}`);
  }

  // ------------------------------------------------------------------ writing
  /** The composer's text changed: "typing" goes when the guard lets it (while the person types, paced, where they may write). */
  typed(text: string): void {
    this.draft = text;
    if (text === '' || this.editing !== null || this.channelId === '') return;
    const d = new guard.Details();
    d.channel = this.channelId;
    const v = guard.begin('typing', d);
    if (v.ok) guard.request(v, 'POST', `/channels/${this.channelId}/typing`, undefined).catch((e) => { this.log(`typing failed: ${e.message}`); });
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
    const editing = this.editing, replyTo = this.replyTo;
    if (editing !== null && text === editing.content) { this.draft = ''; this.editing = null; this.changed(); return; }
    const d = new guard.Details();
    d.channel = ch; d.text = text; d.edit = editing !== null;
    const v = guard.begin(editing !== null ? 'edit' : 'send', d);
    if (!v.ok) { this.refuse(v.message); return; }   // the draft stays in the composer
    this.draft = ''; this.editing = null; this.replyTo = null; this.error = '';
    if (editing !== null) {
      this.changed();
      try { await guard.request(v, 'PATCH', `/channels/${ch}/messages/${editing.id}`, { content: text }); }
      catch (e) { this.error = `Could not edit the message: ${e.message}`; this.changed(); }
      return;
    }
    const m = this.pendingMessage(ch, text);
    const body: any = { content: text, nonce: m.nonce, tts: false, flags: 0 };
    if (replyTo !== null) {
      m.replyTo = `${replyTo.author}: ${replyTo.content.slice(0, 80)}`;
      body.message_reference = { message_id: replyTo.id, channel_id: ch };
    }
    await this.post(ch, m, body, [], v, null);
  }
  /** Sends files picked or dropped, with the composer's text (Discord's cloud upload: services/upload.ts). */
  async sendFiles(paths: string[]): Promise<void> {
    const ch = this.channelId;
    if (ch === '' || paths.length === 0) return;
    const files: Upload[] = [];
    try { for (const p of paths) files.push(readUpload(p)); }
    catch (e) { this.error = `Could not read the file: ${e.message}`; this.changed(); return; }
    const text = this.draft.trim();
    const d = new guard.Details();
    d.channel = ch; d.text = text;
    for (const f of files) d.sizes.push(f.bytes.length);
    const up = guard.begin('upload', d, 1 + files.length);   // the request that names the files, and one PUT each
    if (!up.ok) { this.refuse(up.message); return; }
    const v = guard.begin('send', d);
    if (!v.ok) { this.refuse(v.message); return; }
    this.draft = ''; this.replyTo = null; this.editing = null; this.error = '';
    const m = this.pendingMessage(ch, text);
    for (const f of files) { const a = new Attachment(); a.filename = f.filename; a.size = f.bytes.length; m.attachments.push(a); }
    await this.post(ch, m, { content: text, nonce: m.nonce, tts: false, flags: 0 }, files, v, up);
  }
  private pendingMessage(ch: string, text: string): Message {
    const m = new Message();
    m.nonce = snowflakeNow(); m.pending = true; m.channelId = ch; m.authorId = this.me.id; m.author = this.me.name; m.content = text;
    m.timestamp = new Date().toISOString();
    return m;
  }
  /** Shows m at once, uploads its files, sends it; the server's echo (found by the nonce) replaces it. */
  private async post(ch: string, m: Message, body: any, files: Upload[], v: guard.Verdict, up: guard.Verdict | null): Promise<void> {
    const list = this.messages.get(ch);
    if (list !== undefined) list.push(m);
    this.changed();
    try {
      if (up !== null) {
        body.attachments = await uploadFiles(ch, files, up);
        this.log(`uploaded ${files.map((f: Upload) => f.filename).join(', ')}`);
      }
      const d: any = await guard.request(v, 'POST', `/channels/${ch}/messages`, body);
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
    const d = new guard.Details();
    d.channel = m.channelId;
    const v = guard.begin('delete', d);
    if (!v.ok) { this.refuse(v.message); return; }
    try { await guard.request(v, 'DELETE', `/channels/${m.channelId}/messages/${m.id}`, undefined); }
    catch (e) { this.error = `Could not delete the message: ${e.message}`; this.changed(); }
  }
  revealSpoilers(m: Message): void { this.revealed.add(m.id); this.changed(); }

  // ------------------------------------------------------------------ reactions and polls
  findMessage(ch: string, id: string): Message | null {
    const l = this.messages.get(ch);
    if (l !== undefined) for (const m of l) if (m.id === id) return m;
    return null;
  }
  /** Adds my reaction or takes it off (r null: a 👍); shown at once, the gateway's echo changes nothing. */
  async react(m: Message, r: Reaction | null): Promise<void> {
    const emoji: any = r !== null ? { id: r.id, name: r.name } : { id: '', name: '👍' };
    let on = true;
    for (const x of m.reactions) if ((emoji.id !== '' ? x.id === emoji.id : x.name === emoji.name) && x.me) on = false;
    const d = new guard.Details();
    d.channel = m.channelId; d.author = on ? m.authorId : ''; d.target = `${m.id} ${emoji.id !== '' ? emoji.id : emoji.name}`;
    d.newReaction = on && m.reactions.every((x: Reaction) => emoji.id !== '' ? x.id !== emoji.id : x.name !== emoji.name);
    const v = guard.begin('react', d);
    if (!v.ok) { this.refuse(v.message); return; }
    const path = reactionPath(emoji.id, emoji.name);
    if (on) reactionAdded(m.reactions, emoji, true); else reactionRemoved(m.reactions, emoji, true, false);
    this.log(`react ${m.id} ${emoji.name} ${on ? 'on' : 'off'}`);
    this.changed();
    try { await guard.request(v, on ? 'PUT' : 'DELETE', `/channels/${m.channelId}/messages/${m.id}/reactions/${path}/@me?location=Message&type=0`, undefined); }
    catch (e) { this.error = `Could not react: ${e.message}`; this.changed(); }
  }
  private reacted(t: string, d: any): void {
    const m = this.findMessage(str(d.channel_id), str(d.message_id));
    if (m === null) return;
    const mine = str(d.user_id) === this.me.id;
    if (t === 'MESSAGE_REACTION_ADD') reactionAdded(m.reactions, d.emoji, mine);
    else if (t === 'MESSAGE_REACTION_REMOVE') reactionRemoved(m.reactions, d.emoji, mine, false);
    else if (t === 'MESSAGE_REACTION_REMOVE_EMOJI') reactionRemoved(m.reactions, d.emoji, false, true);
    else if (t === 'MESSAGE_REACTION_REMOVE_ALL') m.reactions = [];
    this.log(`reactions ${m.id}: ${m.reactions.map((r: Reaction) => `${r.name}${r.count}${r.me ? '*' : ''}`).join(' ')}`);
  }
  /** Votes for an answer of a poll, or takes the vote back (one answer, or several when the poll allows it). */
  async vote(m: Message, answerId: i32): Promise<void> {
    const p = m.poll;
    if (p === null || p.finalized) return;
    const d = new guard.Details();
    d.channel = m.channelId;
    const v = guard.begin('vote', d);
    if (!v.ok) { this.refuse(v.message); return; }
    const chosen: string[] = [];
    for (const a of p.answers) {
      const on = a.id === answerId ? !a.mine : p.multi && a.mine;
      if (on !== a.mine) pollVoted(p, a.id, true, on);
      if (on) chosen.push(`${a.id}`);
    }
    this.log(`vote ${m.id}: ${chosen.join(',')}`);
    this.changed();
    try { await guard.request(v, 'PUT', `/channels/${m.channelId}/polls/${m.id}/answers/@me`, { answer_ids: chosen }); }
    catch (e) { this.error = `Could not vote: ${e.message}`; this.changed(); }
  }
  private pollVote(add: boolean, d: any): void {
    const m = this.findMessage(str(d.channel_id), str(d.message_id));
    const p = m !== null ? m.poll : null;
    if (p === null) return;
    pollVoted(p, d.answer_id ?? 0, str(d.user_id) === this.me.id, add);
    this.log(`poll ${str(d.message_id)}: ${p.answers.map((a) => `${a.text} ${a.count}${a.mine ? '*' : ''}`).join(', ')}`);
  }

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
    const v = guard.begin('ack');   // only what the window in front shows is read
    if (!v.ok) return;
    const r = this.read(ch);
    r.lastId = c.lastMessageId; r.mentions = 0;
    const lastViewed = Math.floor((Date.now() - DISCORD_EPOCH) / 86400000);
    guard.request(v, 'POST', `/channels/${ch}/messages/${c.lastMessageId}/ack`, { token: null, last_viewed: lastViewed })
      .catch((e) => { this.log(`ack failed: ${e.message}`); });
  }
  /** Messages that arrive in the open channel are read: one ack for a burst. */
  private ackSoon(ch: string): void { guard.afterBurst((): void => { this.ack(ch); }); }

  // ------------------------------------------------------------------ the conversation: unread line, end of the history, jumps, pins, threads
  /** The last message read when the open channel was opened ('' when it was read): the 'new messages' line goes above the next one. */
  newFrom = '';
  /** The history shows its end (MessageView tells, from its scroll); messages that came while it did not. */
  atEnd = true;
  newWhileUp: i32 = 0;
  /** A message to bring into view and light up (a reply's reference, a pin): MessageView scrolls to it once. */
  jumpId = '';
  /** Channels whose loaded messages stop before the present (a jump far back): new messages wait for 'Jump to present'. */
  private detached: Set<string> = new Set<string>();
  /** What shows at the right: 'members' (a server's member list), 'pins' (the open channel's) or 'thread' (threadId, read beside). */
  pane = 'members';
  threadId = '';
  /** The pinned messages by channel, fetched when the pins are opened and kept (a pin elsewhere drops them: CHANNEL_PINS_UPDATE). */
  pins: Map<string, Message[]> = new Map<string, Message[]>();
  private pinning: Set<string> = new Set<string>();   // channels where I pinned: the CHANNEL_PINS_UPDATE that follows is mine, the pins kept are right

  /** The history scrolled to its end or away from it: at the end the messages that came are read. */
  setAtEnd(on: boolean): void {
    if (on === this.atEnd) return;
    this.atEnd = on;
    if (on) { this.newWhileUp = 0; if (!this.detached.has(this.channelId)) this.ack(this.channelId); }
    this.changed();
  }
  /** The open channel shows messages older than the present (after a jump far back). */
  showingOlder(): boolean { return this.detached.has(this.channelId); }
  /** Back to the latest messages: the page of the present again when a jump left it, else the end of the list (MessageView). */
  jumpToPresent(): void {
    const ch = this.channelId;
    this.jumpId = '';
    if (this.detached.has(ch)) { this.detached.delete(ch); this.messages.delete(ch); this.complete.delete(ch); this.loadHistory(ch); }
    this.log(`jump ${ch}: present`);
    this.setAtEnd(true);
    this.changed();
  }
  /** Shows message id of the open channel (a reply's reference, a pin): at once when loaded, else the page around it, fetched once. */
  async jumpTo(id: string): Promise<void> {
    const ch = this.channelId;
    if (id === '' || ch === '') return;
    if (this.findMessage(ch, id) !== null) { this.jumpId = id; this.log(`jump ${ch}: ${id} (loaded)`); this.changed(); return; }
    this.loading = true; this.changed();
    try {
      const page: any = await guard.api('history', 'GET', `/channels/${ch}/messages?around=${id}&limit=${MESSAGES_PAGE}`, undefined);
      const got: Message[] = [];
      if (Array.isArray(page)) for (let i = page.length - 1; i >= 0; i--) got.push(this.message(page[i]));
      const list = this.messages.get(ch);
      if (got.length === 0 || got.every((m: Message) => m.id !== id)) this.error = 'That message is gone.';
      else if (list !== undefined && list.length > 0 && compareIds(got[got.length - 1].id, list[0].id) >= 0) {   // it reaches what is loaded: one list
        this.messages.set(ch, got.filter((m: Message) => compareIds(m.id, list[0].id) < 0).concat(list));
      } else { this.messages.set(ch, got); this.detached.add(ch); this.complete.delete(ch); }
      if (this.error === '') this.jumpId = id;
      this.log(`jump ${ch}: ${id} (fetched, ${got.length} around${this.detached.has(ch) ? ', older than the present' : ''})`);
    } catch (e) { this.error = `Could not load that message: ${e.message}`; }
    this.loading = false; this.changed();
  }

  /** Pin and unpin are offered: in a DM, or in a server with the right (the guard's permissions; a thread has its parent's). */
  canPin(ch: string): boolean { return guard.mayPin(ch); }
  /** Shows the open channel's pins at the right (fetched the first time), or the member list again. */
  togglePins(): void {
    if (this.pane === 'pins') { this.pane = 'members'; this.changed(); return; }
    this.pane = 'pins'; this.changed();
    if (!this.pins.has(this.channelId)) this.loadPins(this.channelId);
  }
  private async loadPins(ch: string): Promise<void> {
    try {
      const r: any = await guard.api('pins', 'GET', `/channels/${ch}/messages/pins?limit=50`, undefined);
      const out: Message[] = [];
      if (r !== null && Array.isArray(r.items)) for (const it of r.items) { const m = this.message(it.message); m.pinned = true; out.push(m); }
      this.pins.set(ch, out);
      this.log(`pins ${ch}: ${out.map((m: Message) => m.id).join(', ')}`);
    } catch (e) { this.error = `Could not load the pins: ${e.message}`; }
    this.changed();
  }
  /** Pins m or unpins it: shown at once (and in the pins when they are loaded); Discord's echo is a MESSAGE_UPDATE. */
  async pin(m: Message): Promise<void> {
    const on = !m.pinned, ch = m.channelId;
    const d = new guard.Details();
    d.channel = ch;
    const v = guard.begin('pin', d);
    if (!v.ok) { this.refuse(v.message); return; }
    m.pinned = on;
    const kept = this.pins.get(ch);
    if (kept !== undefined) this.pins.set(ch, on ? [m].concat(kept) : kept.filter((x: Message) => x.id !== m.id));
    this.log(`pin ${m.id} ${on ? 'on' : 'off'}`);
    this.changed();
    if (kept !== undefined) this.pinning.add(ch);
    try { await guard.request(v, on ? 'PUT' : 'DELETE', `/channels/${ch}/messages/pins/${m.id}`, undefined); }
    catch (e) { m.pinned = !on; this.pins.delete(ch); this.pinning.delete(ch); this.error = `Could not ${on ? 'pin' : 'unpin'} the message: ${e.message}`; this.changed(); }
  }
  /** Reads a thread or a forum post beside the channel (its history fetched the first time); '' closes it. */
  openThread(id: string): void {
    this.threadId = id; this.pane = id !== '' ? 'thread' : 'members';
    this.changed();
    if (id === '') return;
    if (!this.messages.has(id)) this.loadHistory(id); else this.ack(id);
    this.log(`thread pane ${id}`);
  }
}

/** A snowflake for now, as the web client's nonces: (ms since 2015) << 22, in decimal without BigInt (the low half carries). */
function snowflakeNow(): string {
  const ms = Math.max(0, Date.now() - DISCORD_EPOCH), hi = Math.floor(ms / 10000000), lo = ms % 10000000;
  const low = lo * 4194304, carry = Math.floor(low / 10000000), rest = `${low % 10000000}`;
  return `${hi * 4194304 + carry}${'0'.repeat(7 - rest.length)}${rest}`;
}

function attachments(list: any): Attachment[] {
  const out: Attachment[] = [];
  if (Array.isArray(list)) for (const f of list) {
    const a = new Attachment();
    a.id = str(f.id); a.filename = str(f.filename); a.url = str(f.url); a.proxyUrl = str(f.proxy_url); a.size = f.size ?? 0;
    a.description = str(f.description); a.spoiler = a.filename.startsWith('SPOILER_') || ((f.flags ?? 0) & 8) !== 0;
    const type = str(f.content_type), ext = a.filename.slice(a.filename.lastIndexOf('.') + 1).toLowerCase();
    a.kind = type.startsWith('image/') || (type === '' && /^(png|jpe?g|gif|webp)$/.test(ext)) ? 'image'
      : type.startsWith('video/') || (type === '' && /^(mp4|mov|webm)$/.test(ext)) ? 'video'
      : typeof f.duration_secs === 'number' ? 'voice'
      : type.startsWith('audio/') || (type === '' && /^(mp3|ogg|wav|flac|m4a)$/.test(ext)) ? 'audio' : 'file';
    if (a.kind === 'image' || a.kind === 'video') { a.width = f.width ?? 0; a.height = f.height ?? 0; }
    if (a.kind === 'voice') { a.duration = f.duration_secs; a.waveform = str(f.waveform); }
    out.push(a);
  }
  return out;
}
/** The line over a reply: the start of the message it answers, or what it holds when it has no text. */
function replyText(r: any): string {
  const text = str(r.content);
  if (text !== '') return text.slice(0, 80);
  return Array.isArray(r.attachments) && r.attachments.length > 0 || Array.isArray(r.embeds) && r.embeds.length > 0 ? 'Click to see attachment' : '';
}

/** A channel as the notification rules see it. */
function where(c: Channel): Where { const w = new Where(); w.id = c.id; w.guildId = c.guildId; w.type = c.type; w.parentId = c.parentId; return w; }

/** Snowflakes compared as numbers: a longer id is a later one. */
export function compareIds(a: string, b: string): i32 { return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0; }

/** Discord's sidebar order: channels without a category first, then each category followed by its channels, by position. */
function sortChannels(list: Channel[]): void {
  const byPos = (a: Channel, b: Channel): i32 => a.position !== b.position ? a.position - b.position : compareIds(a.id, b.id);
  const threads = list.filter((c: Channel) => isThread(c.type));
  const channels = list.filter((c: Channel) => !isThread(c.type));
  const cats = channels.filter((c: Channel) => c.type === CH_CATEGORY).sort(byPos);
  const inCategory = (c: Channel): boolean => cats.some((cat: Channel) => cat.id === c.parentId);
  const loose = channels.filter((c: Channel) => c.type !== CH_CATEGORY && !inCategory(c)).sort(byPos);
  const ordered: Channel[] = loose.slice();
  for (const cat of cats) {
    ordered.push(cat);
    for (const c of channels.filter((x: Channel) => x.parentId === cat.id && x.type !== CH_CATEGORY).sort(byPos)) ordered.push(c);
  }
  // each channel's active threads under it, the newest first; a thread whose channel is not listed goes last
  const out: Channel[] = [];
  for (const c of ordered) { out.push(c); for (const t of threads.filter((x: Channel) => x.parentId === c.id).sort((a: Channel, b: Channel) => compareIds(b.id, a.id))) out.push(t); }
  for (const t of threads) if (!ordered.some((c: Channel) => c.id === t.parentId)) out.push(t);
  list.length = 0;
  for (const c of out) list.push(c);
}

export const store = new Store();
