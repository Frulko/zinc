// Fuzzy matching for the file finder and the command palette, in the spirit of Zed's: the query's characters must
// appear in order (case-insensitive); matches at word starts, consecutive runs and matches in the file name score
// higher. `hits` are the matched character positions, drawn highlighted in the lists.

export class Fuzzy {
  score: number; hits: i32[];
  constructor(score: number, hits: i32[]) { this.score = score; this.hits = hits; }
}

function lower(c: i32): i32 { return c >= 65 && c <= 90 ? c + 32 : c; }
function isSep(c: i32): boolean { return c === 47 || c === 95 || c === 45 || c === 46 || c === 32 || c === 58; }
/** Word start: after a separator, or an upper-case letter after a lower-case one (camelCase). */
function boundary(s: string, i: i32): boolean {
  if (i === 0) return true;
  const p = s.charCodeAt(i - 1), c = s.charCodeAt(i);
  return isSep(p) || (c >= 65 && c <= 90 && p >= 97 && p <= 122);
}

/** Matches `query` in `text`; null when some character is missing. `nameFrom`: where the file name starts (bonus). */
export function fuzzy(query: string, text: string, nameFrom: i32 = 0): Fuzzy | null {
  if (query.length === 0) return new Fuzzy(0, []);
  // the query as one substring (preferably at a word start) scores best; then two passes: prefer word starts
  // (greedy), else the first occurrence of each character
  let best: Fuzzy | null = null;
  const low = text.toLowerCase(), q = query.toLowerCase();
  let at = low.indexOf(q), first = at;
  while (at >= 0 && !boundary(text, at)) at = low.indexOf(q, at + 1);
  if (at < 0) at = first;
  if (at >= 0) {
    const hits: i32[] = [];
    for (let i = 0; i < q.length; i++) hits.push(at + i);
    best = new Fuzzy(scoreOf(text, hits, nameFrom), hits);
  }
  for (let pass = 0; pass < 2; pass++) {
    const hits: i32[] = [];
    let pos: i32 = 0, ok = true;
    for (let q = 0; q < query.length && ok; q++) {
      const qc = lower(query.charCodeAt(q));
      let found: i32 = -1;
      if (pass === 0) for (let i = pos; i < text.length; i++) if (lower(text.charCodeAt(i)) === qc && (boundary(text, i) || (hits.length > 0 && hits[hits.length - 1] === i - 1))) { found = i; break; }
      if (found < 0) for (let i = pos; i < text.length; i++) if (lower(text.charCodeAt(i)) === qc) { found = i; break; }
      if (found < 0) ok = false; else { hits.push(found); pos = found + 1; }
    }
    if (!ok) return null;
    const sc = scoreOf(text, hits, nameFrom);
    if (best === null || sc > (best as Fuzzy).score) best = new Fuzzy(sc, hits);
  }
  return best;
}

function scoreOf(text: string, hits: i32[], nameFrom: i32): number {
  let s: number = 0;
  for (let k = 0; k < hits.length; k++) {
    const i = hits[k];
    s += 1;
    if (boundary(text, i)) s += 8;
    if (k > 0 && hits[k - 1] === i - 1) s += 5;           // consecutive
    else if (k > 0) s -= Math.min(3, (i - hits[k - 1]) * 0.1);   // gap
    if (i >= nameFrom) s += 3;                           // in the file name rather than the directories
  }
  return s - text.length * 0.02;                          // shorter candidates first on ties
}

/** Splits `text` into alternating [plain, matched] segments for drawing: even indices plain, odd matched. */
export function segments(text: string, hits: i32[]): string[] {
  const out: string[] = [];
  let pos: i32 = 0, k: i32 = 0;
  while (pos < text.length) {
    let plainEnd = k < hits.length ? hits[k] : text.length;
    out.push(text.slice(pos, plainEnd));
    let e = plainEnd;
    while (k < hits.length && hits[k] === e) { e++; k++; }
    out.push(text.slice(plainEnd, e));
    pos = e;
  }
  return out;
}
