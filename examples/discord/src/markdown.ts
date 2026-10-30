// Discord's Markdown, as its clients draw a message: ``` code blocks, > and >>> quotes, # ## ### headings, -# subtext, - * and 1. lists
// (two levels); inline **bold**, *italic* and _italic_, __underline__, ~~strike~~, `code`, ||spoilers||, [masked](links) (also
// [t](<url>) and [t](url "title")), bare links and <autolinks>, mentions (<@id>, <#id>, <@&id>, @everyone, @here), slash commands
// (</name sub:id>), server links (<id:customize>), timestamps (<t:seconds:style>, in the reader's time zone) and custom emoji (<:name:id>:
// a run of their own, which the screen draws as the emoji's picture). A block is one text and its style runs, so the screen draws it as
// one selectable Text (ui.setTextRuns), its custom emoji as pictures in the lines.
// Not lib/std/markdown (CommonMark-like: `__` is bold there, no spoiler, strike or mention) nor md4c (zinc:markdown: indented code,
// setext headings and soft breaks that Discord does not have): Discord's dialect is its own (simple-markdown rules).
import * as ui from 'zinc:ui';
import { formatStamp } from './content';

export const K_TEXT = 0, K_QUOTE = 1, K_HEADING = 2, K_SUB = 3, K_CODE = 4, K_LIST = 5;
/** Colour roles of a run: the text's own, inline code, a link, a mention, a hidden spoiler, a custom emoji (its text is :name:), a
 *  timestamp. */
export const R_TEXT = 0, R_CODE = 1, R_LINK = 2, R_MENTION = 3, R_SPOILER = 4, R_EMOJI = 5, R_TIME = 6;
const SERVER_LINKS: Map<string, string> = new Map<string, string>([['customize', 'Channels & Roles'], ['browse', 'Browse Channels'],
  ['guide', 'Server Guide'], ['home', 'Server Home'], ['linked-roles', 'Linked Roles']]);
const BOLD = ui.RUN_BOLD, ITALIC = ui.RUN_ITALIC, MONO = ui.RUN_MONO, UNDERLINE = ui.RUN_UNDERLINE, STRIKE = ui.RUN_STRIKE;

export class MdBlock {
  kind: i32;
  /** K_HEADING: 1..3. K_LIST: the depth, 0 or 1. */
  level: i32 = 0;
  /** K_LIST: the item's mark, "•" or its number ("2."). */
  marker = '';
  /** K_CODE: the fence's language. */
  lang = '';
  text = '';
  /** [length, style (ui.RUN_*), role (R_*)...] over text. */
  runs: i32[] = [];
  /** The ids of the custom emoji, one per R_EMOJI run, in order. */
  emoji: string[] = [];
  constructor(kind: i32) { this.kind = kind; }
}

/** Names of what a message mentions: kind '@' a user, '#' a channel, '&' a role. */
export type Names = (kind: string, id: string) => string;

/** The blocks of a message. A spoiler stays hidden (its characters drawn as bullets) until `reveal`.
 *  ponytail: bullets, not Discord's dark box, which needs a background colour for a run of setTextRuns. */
export function parse(src: string, names: Names, reveal: boolean): MdBlock[] {
  const out: MdBlock[] = [];
  let at = 0;
  while (at < src.length) {
    const open = src.indexOf('```', at);
    const close = open >= 0 ? src.indexOf('```', open + 3) : -1;
    if (close < 0) { lines(src.slice(at), names, reveal, out); break; }
    if (open > at) lines(src.slice(at, open), names, reveal, out);
    const b = new MdBlock(K_CODE);
    let code = src.slice(open + 3, close);
    const nl = code.indexOf('\n');
    if (nl > 0 && /^[A-Za-z0-9_+-]+$/.test(code.slice(0, nl))) { b.lang = code.slice(0, nl); code = code.slice(nl + 1); }
    else if (nl === 0) code = code.slice(1);
    b.text = code.endsWith('\n') ? code.slice(0, code.length - 1) : code;
    out.push(b);
    at = close + 3;
    if (src.charAt(at) === '\n') at++;
  }
  return out;
}

/** Lines outside code blocks: consecutive lines of one kind make one block. */
function lines(text: string, names: Names, reveal: boolean, out: MdBlock[]): void {
  let src = text;
  while (src.endsWith('\n')) src = src.slice(0, src.length - 1);   // the line break before a code block
  if (src === '') return;
  let kind = -1, level = 0, marker = '', body: string[] = [], quoteRest = false;
  const flush = (): void => {
    if (kind < 0) return;
    const b = new MdBlock(kind);
    b.level = level; b.marker = marker;
    inline(body.join('\n'), names, reveal, b);
    out.push(b);
    kind = -1; body = [];
  };
  for (const line of src.split('\n')) {
    let k = K_TEXT, lv = 0, mk = '', t = line;
    const li = /^( *)([-*]|\d{1,2}\.) (.*)$/.exec(line);
    if (quoteRest) k = K_QUOTE;
    else if (line.startsWith('>>> ')) { k = K_QUOTE; t = line.slice(4); quoteRest = true; }
    else if (line.startsWith('> ') || line === '>') { k = K_QUOTE; t = line.slice(2); }
    else if (line.startsWith('-# ')) { k = K_SUB; t = line.slice(3); }
    else if (li !== null) { k = K_LIST; lv = li[1].length >= 2 ? 1 : 0; mk = li[2].endsWith('.') ? li[2] : '•'; t = li[3]; }
    else {
      const h = /^(#{1,3}) (.*)$/.exec(line);
      if (h !== null) { k = K_HEADING; lv = h[1].length; t = h[2]; }
    }
    if (k !== kind || k === K_HEADING || k === K_LIST) flush();
    kind = k; level = lv; marker = mk; body.push(t);
  }
  flush();
}

/** True when `mark` appears again after i (a closing mark exists). */
const closes = (s: string, mark: string, i: i32): boolean => s.indexOf(mark, i) >= 0;
function isWord(c: string): boolean { return /^[A-Za-z0-9]$/.test(c); }

/** The text of `s` without its marks and the runs they give, into b. */
function inline(s: string, names: Names, reveal: boolean, b: MdBlock): void {
  let text = '';
  const runs: i32[] = [];
  let style = 0, spoiler = false;
  let runStart = 0, runStyle = 0, runRole = R_TEXT;
  const role = (): i32 => spoiler && !reveal ? R_SPOILER : R_TEXT;
  const cut = (nextStyle: i32, nextRole: i32): void => {
    if (text.length > runStart) { runs.push(text.length - runStart); runs.push(runStyle); runs.push(runRole); }
    runStart = text.length; runStyle = nextStyle; runRole = nextRole;
  };
  const add = (piece: string): void => { text += spoiler && !reveal ? '•'.repeat(piece.length) : piece; };
  /** A piece in its own role (code, link, mention), then back to the text. */
  const span = (piece: string, extra: i32, r: i32): void => {
    cut(style | extra, spoiler && !reveal ? R_SPOILER : r);
    add(piece);
    cut(style, role());
  };
  const toggle = (bit: i32): void => { style = style ^ bit; cut(style, role()); };
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i), two = s.slice(i, i + 2);
    if (c === '\\' && i + 1 < s.length && '\\`*_~|<>[]()#-.'.indexOf(s.charAt(i + 1)) >= 0) { add(s.charAt(i + 1)); i += 2; continue; }
    if (c === '`') {
      const ticks = s.charAt(i + 1) === '`' ? 2 : 1;
      const end = s.indexOf('`'.repeat(ticks), i + ticks);
      if (end > i + ticks) { span(s.slice(i + ticks, end), MONO, R_CODE); i = end + ticks; continue; }
    }
    if (c === '<') {
      const head = s.slice(i, i + 160);
      const t = /^<t:(-?\d{1,13})(?::([tTdDfFRsS]))?>/.exec(head);
      if (t !== null) { span(formatStamp(parseInt(t[1]), t.length > 2 && typeof t[2] === 'string' ? t[2] : 'f', Date.now()), 0, R_TIME); i += t[0].length; continue; }
      const cmd = /^<\/([^:<>\n]+):\d+>/.exec(head);
      if (cmd !== null) { span('/' + cmd[1], 0, R_MENTION); i += cmd[0].length; continue; }
      const nav = /^<id:([a-z-]+)>/.exec(head);
      const navName = nav !== null ? SERVER_LINKS.get(nav[1]) : undefined;
      if (nav !== null && navName !== undefined) { span(navName, 0, R_MENTION); i += nav[0].length; continue; }
      const auto = /^<(https?:\/\/[^>\s]+)>/.exec(head);
      if (auto !== null) { span(auto[1], 0, R_LINK); i += auto[0].length; continue; }
      const m = /^<(@!?|@&|#|a?:[A-Za-z0-9_]+:)(\d+)>/.exec(s.slice(i, i + 64));
      if (m !== null) {
        const k = m[1];
        if (k.endsWith(':')) {                                               // custom emoji: its :name: in a run of its own
          if (!(spoiler && !reveal)) b.emoji.push(m[2]);
          span(k.startsWith('a') ? k.slice(1) : k, 0, R_EMOJI);
        }
        else span(k === '#' ? '#' + names('#', m[2]) : '@' + names(k === '@&' ? '&' : '@', m[2]), 0, R_MENTION);
        i += m[0].length;
        continue;
      }
    }
    if (c === '[') {
      const m = /^\[([^\]\[]+)\]\(<?(https?:\/\/[^)\s>]+)>?(?: +"[^"]*")?\)/.exec(s.slice(i));
      if (m !== null) { span(m[1], UNDERLINE, R_LINK); i += m[0].length; continue; }
    }
    if (c === 'h' && (s.startsWith('https://', i) || s.startsWith('http://', i))) {
      let e = i;
      while (e < s.length && ' \n<>'.indexOf(s.charAt(e)) < 0) e++;
      span(s.slice(i, e), 0, R_LINK); i = e; continue;
    }
    if (c === '@' && (s.startsWith('@everyone', i) || s.startsWith('@here', i))) {
      const w = s.startsWith('@everyone', i) ? 9 : 5;
      span(s.slice(i, i + w), 0, R_MENTION); i += w; continue;
    }
    if (two === '||' && (spoiler || closes(s, '||', i + 2))) { spoiler = !spoiler; cut(style, role()); i += 2; continue; }
    if (two === '**' && ((style & BOLD) !== 0 || closes(s, '**', i + 2))) { toggle(BOLD); i += 2; continue; }
    if (two === '__' && ((style & UNDERLINE) !== 0 || closes(s, '__', i + 2))) { toggle(UNDERLINE); i += 2; continue; }
    if (two === '~~' && ((style & STRIKE) !== 0 || closes(s, '~~', i + 2))) { toggle(STRIKE); i += 2; continue; }
    if (c === '*' || c === '_') {
      const before = i > 0 ? s.charAt(i - 1) : ' ', after = i + 1 < s.length ? s.charAt(i + 1) : ' ';
      const open = (style & ITALIC) !== 0;
      const ok = c === '_' && isWord(before) && isWord(after) ? false
        : open ? before !== ' ' : after !== ' ' && after !== '\n' && closes(s, c, i + 2);
      if (ok) { toggle(ITALIC); i++; continue; }
    }
    add(c);
    i++;
  }
  cut(0, R_TEXT);
  b.text = text;
  b.runs = runs;
}

/** The plain text of the blocks with the marks of their runs, for the test log: *b* bold, /i/ italic, `m` mono, _u_ underline,
 *  ~s~ strike, {link}, <mention>, ▒hidden spoiler▒, [emoji], ⟨timestamp⟩; a list item is li<depth><mark>. */
export function describe(blocks: MdBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === K_CODE) { out.push(`code(${b.lang}):${b.text}`); continue; }
    let s = '', at = 0;
    for (let k = 0; k < b.runs.length; k += 3) {
      let piece = b.text.slice(at, at + b.runs[k]);
      at += b.runs[k];
      const st = b.runs[k + 1], r = b.runs[k + 2];
      if ((st & MONO) !== 0) piece = '`' + piece + '`';
      if ((st & BOLD) !== 0) piece = '*' + piece + '*';
      if ((st & ITALIC) !== 0) piece = '/' + piece + '/';
      if ((st & UNDERLINE) !== 0) piece = '_' + piece + '_';
      if ((st & STRIKE) !== 0) piece = '~' + piece + '~';
      if (r === R_LINK) piece = '{' + piece + '}';
      if (r === R_MENTION) piece = '<' + piece + '>';
      if (r === R_SPOILER) piece = '▒' + piece + '▒';
      if (r === R_EMOJI) piece = '[' + piece + ']';
      if (r === R_TIME) piece = '⟨' + piece + '⟩';
      s += piece;
    }
    out.push((b.kind === K_LIST ? `li${b.level}${b.marker}` : ['text', 'quote', 'h' + b.level, 'sub'][b.kind]) + ':' + s);
  }
  return out.join(' | ');
}

/** Only custom emoji and spaces (at most 30): Discord draws them large. */
export function onlyEmoji(blocks: MdBlock[]): boolean {
  let n = 0;
  for (const b of blocks) {
    if (b.kind !== K_TEXT) return false;
    let at = 0;
    for (let k = 0; k < b.runs.length; k += 3) {
      const piece = b.text.slice(at, at + b.runs[k]);
      at += b.runs[k];
      if (b.runs[k + 2] === R_EMOJI) n++;
      else if (piece.trim() !== '') return false;
    }
  }
  return n > 0 && n <= 30;
}
