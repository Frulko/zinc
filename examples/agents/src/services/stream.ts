// Bounded reading of a CLI's stdout and bounded keeping of big texts, so a conversation never grows the app's memory:
//
// - LineReader splits the raw output into lines with a buffer of at most LINE_CAP characters. A longer line (a huge tool
//   result in one JSON line) is not parsed: from the moment it passes the cap it goes to disk, and only its first
//   BIG_HEAD characters stay, to tell which tool it belonged to.
// - Spill writes a text to disk in part files of PART_CHARS: « Show all » reads one part at a time, never the whole.
import * as fs from 'zinc:fs';

/** The longest stdout line parsed in memory. */
export const LINE_CAP = 4 * 1024 * 1024;
/** What an oversized line keeps in memory: its start. */
export const BIG_HEAD = 16 * 1024;
/** One part file of a spilled text: what the viewer reads at once. */
export const PART_CHARS = 1024 * 1024;

/** A text kept on disk in parts `<prefix>.<k>.txt`. `raw`: the JSON-escaped text of a stdout line, unescaped when read. */
export class Spill {
  readonly prefix: string;
  readonly raw: boolean;
  parts: i32 = 0;
  total: number = 0;
  private partLen: number = 0;

  constructor(prefix: string, raw: boolean, parts: i32, total: number) {
    this.prefix = prefix; this.raw = raw; this.parts = parts; this.total = total;
  }

  append(s: string): void {
    let at = 0;
    while (at < s.length) {
      if (this.parts === 0 || this.partLen >= PART_CHARS) { this.parts++; this.partLen = 0; }
      const take = Math.min(s.length - at, PART_CHARS - this.partLen);
      // ponytail: a cut can fall between the two halves of a surrogate pair (one emoji in a megabyte shows as two marks)
      fs.appendText(this.part(this.parts - 1), at === 0 && take === s.length ? s : s.slice(at, at + take));
      this.partLen += take; at += take; this.total += take;
    }
  }

  part(k: i32): string { return `${this.prefix}.${k}.txt`; }

  /** Part `k`, as text. */
  read(k: i32): string {
    const t = fs.readText(this.part(k));
    return this.raw ? unescapeLoose(t, false) : t;
  }
}

/** Splits a stream into lines without ever holding more than LINE_CAP + BIG_HEAD characters. */
export class LineReader {
  private buf: string = '';
  private big: Spill | null = null;
  private bigHead: string = '';
  private bigCount: i32 = 0;
  private readonly spillPrefix: string;
  private readonly onLine: (line: string) => void;
  private readonly onBig: (head: string, spill: Spill) => void;

  /** `spillPrefix`: where an oversized line goes (`-line<k>` is added). */
  constructor(spillPrefix: string, onLine: (line: string) => void, onBig: (head: string, spill: Spill) => void) {
    this.spillPrefix = spillPrefix; this.onLine = onLine; this.onBig = onBig;
  }

  feed(chunk: string): void {
    let start = 0;
    while (true) {
      const nl = chunk.indexOf('\n', start);
      this.add(chunk, start, nl < 0 ? chunk.length : nl);
      if (nl < 0) return;
      this.endLine();
      start = nl + 1;
    }
  }

  /** The output ended: a last line without its newline. */
  end(): void { if (this.buf !== '' || this.big !== null) this.endLine(); }

  /** Characters held now (the test's measure). */
  held(): number { return this.buf.length + this.bigHead.length; }

  private add(s: string, a: i32, b: i32): void {
    if (a >= b) return;
    const piece = a === 0 && b === s.length ? s : s.slice(a, b);
    const big = this.big;
    if (big !== null) { big.append(piece); return; }
    if (this.buf.length + piece.length <= LINE_CAP) { this.buf += piece; return; }
    // the line passes the cap: what came and what follows go to disk
    this.bigCount++;
    const sp = new Spill(`${this.spillPrefix}-line${this.bigCount}`, true, 0, 0);
    this.bigHead = this.buf.length >= BIG_HEAD ? this.buf.slice(0, BIG_HEAD) : (this.buf + piece).slice(0, BIG_HEAD);
    sp.append(this.buf);
    sp.append(piece);
    this.buf = '';
    this.big = sp;
  }

  private endLine(): void {
    const big = this.big;
    if (big !== null) {
      const head = this.bigHead;
      this.big = null; this.bigHead = '';
      this.onBig(head, big);
      return;
    }
    let line = this.buf;
    this.buf = '';
    if (line.endsWith('\r')) line = line.slice(0, line.length - 1);
    if (line !== '') this.onLine(line);
  }
}

const HEXD = '0123456789abcdef';
function hexVal(c: string): i32 { return HEXD.indexOf(c.toLowerCase()); }

/**
 * The text of a JSON string body, tolerant of a cut anywhere (a part of a spilled line, the head of one): escapes are
 * decoded, a broken one is kept as it is. `stopAtQuote`: ends at the first unescaped `"` (the end of the string).
 */
export function unescapeLoose(s: string, stopAtQuote: boolean): string {
  let out = '';
  let at = 0;
  while (at < s.length) {
    const bs = s.indexOf('\\', at);
    const q = stopAtQuote ? s.indexOf('"', at) : -1;
    if (q >= 0 && (bs < 0 || q < bs)) return out + s.slice(at, q);
    if (bs < 0) return out + s.slice(at);
    out += s.slice(at, bs);
    if (bs + 1 >= s.length) return out;
    const c = s.charAt(bs + 1);
    at = bs + 2;
    if (c === 'n') out += '\n';
    else if (c === 't') out += '\t';
    else if (c === 'r') out += '\r';
    else if (c === 'b' || c === 'f') { }
    else if (c === 'u') {
      let code = 0, ok = bs + 6 <= s.length;
      for (let k = 2; k < 6 && ok; k++) { const d = hexVal(s.charAt(bs + k)); if (d < 0) ok = false; code = code * 16 + d; }
      if (ok) { out += String.fromCharCode(code); at = bs + 6; } else out += '\\u';
    } else out += c;   // \" \\ \/
  }
  return out;
}

/** The first `n` characters of `s`. */
export function head(s: string, n: i32): string { return s.length <= n ? s : s.slice(0, n); }
