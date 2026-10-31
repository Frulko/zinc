// What a message carries besides its text (docs/reports/discord-message-content.md): embeds, reactions, stickers, a poll, components, a
// thread, and the sentence of a system message. Read from the API's JSON here; state.ts keeps them on its Message, the screen draws them
// (components/Content.tsx). No drawing, no request.

const str = (v: any): string => typeof v === 'string' ? v : '';
import { tr, trn } from './i18n';
const num = (v: any): i32 => typeof v === 'number' ? v : 0;
const has = (v: any): boolean => v !== undefined && v !== null;

/** A picture or a video of an embed: Discord's proxied copy when it has one (the sender's host never sees the reader), its size. */
export class EmbedMedia { url = ''; width: i32 = 0; height: i32 = 0; }
export class EmbedField { name = ''; value = ''; inline = false; }
export class Embed {
  type = ''; title = ''; url = ''; description = ''; color: i32 = -1; author = ''; provider = ''; footer = ''; timestamp = '';
  thumbnail: EmbedMedia | null = null; image: EmbedMedia | null = null; video: EmbedMedia | null = null;
  fields: EmbedField[] = [];
  /** Drawn as its picture alone (a GIF from Tenor or Giphy, an image link): the link in the text is then hidden. */
  pictureOnly(): boolean { return this.type === 'gifv' || this.type === 'image'; }
  /** The picture drawn large: for an image embed Discord puts it in the thumbnail. */
  picture(): EmbedMedia | null { return this.image !== null ? this.image : this.pictureOnly() || this.type === 'video' ? this.thumbnail : null; }
}
export class Reaction { id = ''; name = ''; count: i32 = 0; me = false; }
export class Sticker { id = ''; name = ''; format: i32 = 1; }
export const STICKER_LOTTIE = 3, STICKER_GIF = 4;
export class PollAnswer { id: i32 = 0; text = ''; emoji = ''; emojiId = ''; count: i32 = 0; mine = false; }
export class Poll {
  question = ''; answers: PollAnswer[] = []; multi = false; expiry = ''; finalized = false;
  total(): i32 { let n = 0; for (const a of this.answers) n += a.count; return n; }
  voted(): boolean { return this.answers.some((a: PollAnswer) => a.mine); }
}
/** A button (type 2) or a select menu (3, 5-8) of an action row. */
export class Component { type: i32 = 2; style: i32 = 2; label = ''; emoji = ''; url = ''; disabled = false; }
export class ThreadRef { id = ''; name = ''; count: i32 = 0; }

// message types and flags (the API's numbers)
export const T_DEFAULT = 0, T_REPLY = 19, T_SLASH = 20, T_THREAD_STARTER = 21, T_CONTEXT_MENU = 23, T_POLL_RESULT = 46;
export const F_SUPPRESS_EMBEDS = 1 << 2, F_VOICE = 1 << 13;
/** Types drawn as a message with its author; the others are one line of what happened. */
export function isBody(type: i32): boolean { return type === T_DEFAULT || type === T_REPLY || type === T_SLASH || type === T_THREAD_STARTER || type === T_CONTEXT_MENU; }

function media(v: any): EmbedMedia | null {
  if (!has(v) || str(v.url) === '') return null;
  const m = new EmbedMedia();
  m.url = str(v.proxy_url) !== '' ? str(v.proxy_url) : str(v.url);
  m.width = num(v.width); m.height = num(v.height);
  return m;
}
export function embeds(list: any): Embed[] {
  const out: Embed[] = [];
  if (Array.isArray(list)) for (const v of list) {
    const e = new Embed();
    e.type = str(v.type); e.title = str(v.title); e.url = str(v.url); e.description = str(v.description); e.timestamp = str(v.timestamp);
    if (typeof v.color === 'number') e.color = v.color;
    if (has(v.author)) e.author = str(v.author.name);
    if (has(v.provider)) e.provider = str(v.provider.name);
    if (has(v.footer)) e.footer = str(v.footer.text);
    e.thumbnail = media(v.thumbnail); e.image = media(v.image);
    if (has(v.video)) { const m = new EmbedMedia(); m.url = str(v.video.url); m.width = num(v.video.width); m.height = num(v.video.height); e.video = m; }
    if (Array.isArray(v.fields)) for (const f of v.fields) { const x = new EmbedField(); x.name = str(f.name); x.value = str(f.value); x.inline = f.inline === true; e.fields.push(x); }
    out.push(e);
  }
  return out;
}

export function reactions(list: any): Reaction[] {
  const out: Reaction[] = [];
  if (Array.isArray(list)) for (const v of list) {
    const r = new Reaction();
    r.id = str(v.emoji.id); r.name = str(v.emoji.name); r.count = num(v.count); r.me = v.me === true;
    out.push(r);
  }
  return out;
}
/** The emoji of a reaction in a URL: the character itself, or name:id for a custom one. */
export function reactionPath(id: string, name: string): string { return encodeURIComponent(id !== '' ? `${name}:${id}` : name); }
const same = (r: Reaction, emoji: any): boolean => str(emoji.id) !== '' ? r.id === str(emoji.id) : r.id === '' && r.name === str(emoji.name);
/** MESSAGE_REACTION_ADD. Mine was counted already when I pressed it (the echo changes nothing). */
export function reactionAdded(list: Reaction[], emoji: any, mine: boolean): void {
  for (const r of list) if (same(r, emoji)) { if (!(mine && r.me)) { r.count++; if (mine) r.me = true; } return; }
  const r = new Reaction();
  r.id = str(emoji.id); r.name = str(emoji.name); r.count = 1; r.me = mine;
  list.push(r);
}
/** MESSAGE_REACTION_REMOVE (emoji null: REMOVE_ALL; all: REMOVE_EMOJI, every user's). */
export function reactionRemoved(list: Reaction[], emoji: any, mine: boolean, all: boolean): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (emoji !== null && !same(r, emoji)) continue;
    if (emoji === null || all) { list.splice(i, 1); continue; }
    if (mine && !r.me) return;                                       // the echo of mine, already taken off
    r.count--; if (mine) r.me = false;
    if (r.count <= 0) list.splice(i, 1);
  }
}

export function stickers(list: any): Sticker[] {
  const out: Sticker[] = [];
  if (Array.isArray(list)) for (const v of list) { const s = new Sticker(); s.id = str(v.id); s.name = str(v.name); s.format = num(v.format_type); out.push(s); }
  return out;
}

export function poll(v: any): Poll | null {
  if (!has(v)) return null;
  const p = new Poll();
  p.question = has(v.question) ? str(v.question.text) : ''; p.multi = v.allow_multiselect === true; p.expiry = str(v.expiry);
  if (Array.isArray(v.answers)) for (const a of v.answers) {
    const x = new PollAnswer();
    x.id = num(a.answer_id);
    if (has(a.poll_media)) { x.text = str(a.poll_media.text); if (has(a.poll_media.emoji)) { x.emoji = str(a.poll_media.emoji.name); x.emojiId = str(a.poll_media.emoji.id); } }
    p.answers.push(x);
  }
  pollResults(p, v.results);
  return p;
}
/** The counts of a poll (absent on a fresh one: all zero). */
export function pollResults(p: Poll, r: any): void {
  if (!has(r)) return;
  p.finalized = r.is_finalized === true;
  if (Array.isArray(r.answer_counts)) for (const c of r.answer_counts) for (const a of p.answers) if (a.id === num(c.id)) { a.count = num(c.count); a.mine = c.me_voted === true; }
}
/** MESSAGE_POLL_VOTE_ADD / _REMOVE. Mine was counted when I voted (the echo changes nothing). */
export function pollVoted(p: Poll, answerId: i32, mine: boolean, add: boolean): void {
  for (const a of p.answers) if (a.id === answerId) {
    if (mine && a.mine === add) return;
    a.count += add ? 1 : -1; if (mine) a.mine = add;
  }
}

/** The action rows of a message: buttons and select menus (drawn, never sent: an interaction is a bot's request, a ban risk). */
export function componentRows(list: any): Component[][] {
  const out: Component[][] = [];
  if (Array.isArray(list)) for (const row of list) {
    if (num(row.type) !== 1 || !Array.isArray(row.components)) continue;
    const r: Component[] = [];
    for (const v of row.components) {
      const c = new Component();
      c.type = num(v.type); c.style = num(v.style); c.url = str(v.url); c.disabled = v.disabled === true;
      c.label = c.type === 2 ? str(v.label) : str(v.placeholder) !== '' ? str(v.placeholder) : tr('discord.content.select');
      if (has(v.emoji)) c.emoji = str(v.emoji.name);
      r.push(c);
    }
    out.push(r);
  }
  return out;
}

export function threadRef(v: any): ThreadRef | null {
  if (!has(v)) return null;
  const t = new ThreadRef();
  t.id = str(v.id); t.name = str(v.name); t.count = num(v.message_count);
  return t;
}

/** "Grace used /roll" over the answer of a command (interaction_metadata, or the older interaction). */
export function interactionLine(m: any, userName: (u: any) => string): string {
  const i: any = has(m.interaction_metadata) ? m.interaction_metadata : m.interaction;
  if (!has(i) || !has(i.user)) return '';
  const name = str(i.name) !== '' ? str(i.name) : has(m.interaction) ? str(m.interaction.name) : '';
  if (name === '') return '';
  return tr('discord.system.used', ['user', userName(i.user), 'command', `${m.type === T_CONTEXT_MENU ? '' : '/'}${name}`]);
}

const esc = (s: string): string => s.replace(/([\\*_~`|<>\[\]])/g, '\\$1');
/** What a system message says, in Discord's Markdown (the names in bold), '' for a message with a body. Discord's own sentences
 *  (the web client's English); one the client does not know is "Unsupported message", as Discord's own client says. */
export function systemText(m: any, author: string, mentioned: string, guild: string, meId: string): string {
  const type = num(m.type);
  if (isBody(type) || type === T_POLL_RESULT || type === 24 || type === 47 || type === 64) return '';
  const a = `**${esc(author)}**`, c = esc(str(m.content));
  if (type === 1) return tr('discord.system.added', ['a', a, 'who', esc(mentioned)]);
  if (type === 2) return mentioned === '' || mentioned === author ? tr('discord.system.left', ['a', a]) : tr('discord.system.removed', ['a', a, 'who', esc(mentioned)]);
  if (type === 3) {
    const call: any = m.call, ended = has(call) ? str(call.ended_timestamp) : '';
    let joined = false;
    if (has(call) && Array.isArray(call.participants)) for (const p of call.participants) if (str(p) === meId) joined = true;
    if (ended !== '' && !joined) return tr('discord.system.missed_call', ['a', a]);
    if (ended === '') return tr('discord.system.call_started', ['a', a]);
    const minutes = Math.max(1, Math.round((Date.parse(ended) - Date.parse(str(m.timestamp))) / 60000));
    return tr('discord.system.call_lasted', ['a', a, 'minutes', trn('discord.system.minutes', minutes)]);
  }
  if (type === 4) return tr('discord.system.renamed', ['a', a, 'name', c]);
  if (type === 5) return tr('discord.system.icon', ['a', a]);
  if (type === 6) return tr('discord.system.pinned', ['a', a]);
  if (type === 7) return tr('discord.system.joined', ['a', a]);
  if (type === 8) return c !== '' && c !== '1' ? tr('discord.system.boost_times', ['a', a, 'count', c]) : tr('discord.system.boost', ['a', a]);
  if (type >= 9 && type <= 11) return tr('discord.system.boost_level', ['a', a, 'guild', esc(guild), 'level', type - 8]);
  if (type === 12) return tr('discord.system.follow', ['a', a, 'name', c]);
  if (type === 18) return tr('discord.system.thread', ['a', a, 'name', c]);
  if (type === 22) return tr('discord.system.invite_prompt');
  if (type === 27) return tr('discord.system.stage_started', ['a', a, 'name', c]);
  if (type === 28) return tr('discord.system.stage_ended', ['a', a, 'name', c]);
  if (type === 29) return tr('discord.system.speaker', ['a', a]);
  if (type === 30) return tr('discord.system.request_speak', ['a', a]);
  if (type === 31) return tr('discord.system.stage_topic', ['a', a, 'name', c]);
  if (type === 55) return tr('discord.system.hd', ['a', a]);
  if (type === 65) return tr('discord.system.voice_session', ['a', a]);
  if (type === 67) return tr('discord.system.friends', ['a', a]);
  return tr('discord.system.unsupported');
}
/** The icon of a system row. */
export function systemIcon(type: i32): string {
  if (type === 1 || type === 7 || type === 67) return 'arrow-right';
  if (type === 2) return 'user-minus';
  if (type === 3) return 'phone';
  if (type === 6) return 'pin';
  if (type >= 8 && type <= 11) return 'rocket';
  if (type === 18) return 'message-square';
  if (type === 4 || type === 5 || type === 31) return 'square-pen';
  return 'info';
}

// the names of the months and days, the order of date and time and the 12 or 24 hour clock come from the catalog (discord.time.*)
const MONTHS = (): string[] => tr('discord.time.months').split(',');
const DAYS = (): string[] => tr('discord.time.days').split(',');
const two = (n: number): string => n < 10 ? `0${n}` : `${n}`;
/** A Discord timestamp <t:seconds:style> as the en-US web client writes it, in the reader's time zone; R is relative to now (ms). */
export function formatStamp(seconds: number, style: string, now: number): string {
  const d = new Date(seconds * 1000);
  const clock12 = tr('discord.time.clock12') === '1';
  const h = clock12 ? (d.getHours() % 12 === 0 ? 12 : d.getHours() % 12) : d.getHours(), ampm = clock12 ? ` ${d.getHours() < 12 ? tr('discord.time.am') : tr('discord.time.pm')}` : '';
  const hh = clock12 ? `${h}` : two(h);
  const t = `${hh}:${two(d.getMinutes())}${ampm}`, tt = `${hh}:${two(d.getMinutes())}:${two(d.getSeconds())}${ampm}`;
  const date = tr('discord.time.date', ['m', two(d.getMonth() + 1), 'd', two(d.getDate()), 'y', `${d.getFullYear()}`]);
  const long = tr('discord.time.long', ['month', MONTHS()[d.getMonth()], 'd', `${d.getDate()}`, 'y', `${d.getFullYear()}`]);
  if (style === 't') return t;
  if (style === 'T') return tt;
  if (style === 'd') return date;
  if (style === 'D') return long;
  if (style === 'F') return tr('discord.time.full', ['day', DAYS()[d.getDay()], 'long', long, 't', t]);
  if (style === 's') return tr('discord.time.date_time', ['date', date, 't', t]);
  if (style === 'S') return tr('discord.time.date_time', ['date', date, 't', tt]);
  if (style === 'R') return relative(seconds * 1000 - now);
  return tr('discord.time.at', ['long', long, 't', t]);
}
/** "in 3 hours", "2 months ago", "a few seconds ago" (moment.js's words, which Discord uses). */
function relative(ms: number): string {
  const s = Math.abs(ms) / 1000;
  const words = s < 45 ? tr('discord.rel.seconds') : s < 90 ? trn('discord.rel.minutes', 1) : s < 2700 ? trn('discord.rel.minutes', Math.round(s / 60)) : s < 5400 ? trn('discord.rel.hours', 1)
    : s < 79200 ? trn('discord.rel.hours', Math.round(s / 3600)) : s < 129600 ? trn('discord.rel.days', 1) : s < 2160000 ? trn('discord.rel.days', Math.round(s / 86400))
    : s < 3888000 ? trn('discord.rel.months', 1) : s < 29808000 ? trn('discord.rel.months', Math.round(s / 2592000)) : trn('discord.rel.years', Math.max(1, Math.round(s / 31536000)));
  return ms >= 0 ? tr('discord.rel.future', ['words', words]) : tr('discord.rel.past', ['words', words]);
}

/** A size in Discord's words: 512 bytes, 12.3 KB, 2.50 MB. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return tr('discord.size.bytes', ['n', `${bytes}`]);
  if (bytes < 1048576) return tr('discord.size.kb', ['n', `${Math.round(bytes / 102.4) / 10}`]);
  return tr('discord.size.mb', ['n', (bytes / 1048576).toFixed(2)]);
}
/** A voice message's waveform (base64, one byte a sample): `bars` heights 0..1. */
export function waveform(b64: string, bars: i32): number[] {
  const out: number[] = [];
  const raw = b64 !== '' ? atob(b64) : '';
  for (let i = 0; i < bars; i++) out.push(raw.length > 0 ? raw.charCodeAt(Math.floor(i * raw.length / bars)) / 255 : 0.2);
  return out;
}
