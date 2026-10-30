// Text keys of songs and artists, and the session gap: what the history (services/history.ts) and the recommendations
// (services/genius.ts, run in the recommendation worker: services/recommend.ts) share. No zinc:sqlite here, so a worker can import it.
import { fold } from '../search';

/** A listen more than this after the previous one starts a new session. */
export const SESSION_GAP_S: number = 1800;

// ---- normalising (section 5.3 of docs/reports/ipod-genius.md)

const NOISE: string[] = ['feat', 'ft', 'featuring', 'with', 'remaster', 'remastered', 'remasterizado', 'live', 'edit', 'version', 'explicit',
  'clean', 'mono', 'stereo', 'bonus', 'deluxe', 'single', 'radio', 'acoustic', 'demo', 'instrumental'];
const FEAT: string[] = [' feat. ', ' feat ', ' ft. ', ' ft ', ' featuring ', ' with '];

function isWordChar(c: number): boolean { return (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || c > 127; }

/** Lower case words of a folded text (punctuation is a separator). */
function wordsOf(s: string): string[] {
  const out: string[] = [];
  let w = '';
  for (let i = 0; i < s.length; i++) {
    if (isWordChar(s.charCodeAt(i))) w += s[i];
    else if (w !== '') { out.push(w); w = ''; }
  }
  if (w !== '') out.push(w);
  return out;
}

function noisy(part: string): boolean {
  for (const w of wordsOf(part)) {
    if (/^[0-9]+$/.test(w)) continue;
    for (const k of NOISE) if (w === k) return true;
    if (w.startsWith('remaster')) return true;
  }
  return false;
}

/** Cuts " feat. X" and the like (the first found). */
function cutFeat(s: string): string {
  for (const f of FEAT) { const i = s.indexOf(f); if (i > 0) return s.slice(0, i); }
  return s;
}

function joinWords(s: string): string { return wordsOf(s.split('&').join(' and ')).join(' '); }

/** A title as a key: folded, without "(feat. X)", "[Explicit]", "- Remastered 2011", "- Live at...", "(Radio Edit)", punctuation. */
export function normTitle(title: string): string {
  let s = fold(title);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '(' || c === '[') {
      const close = s.indexOf(c === '(' ? ')' : ']', i + 1);
      if (close > i && noisy(s.slice(i + 1, close))) { i = close + 1; continue; }
    }
    out += c;
    i++;
  }
  s = out;
  const dash = s.indexOf(' - ');
  if (dash > 0 && noisy(s.slice(dash + 3))) s = s.slice(0, dash);
  return joinWords(cutFeat(s));
}

/** An artist as a key: folded, without " feat. X", '&' as 'and', no leading 'the'. */
export function normArtist(artist: string): string {
  let s = joinWords(cutFeat(fold(artist)));
  if (s.startsWith('the ')) s = s.slice(4);
  return s;
}

/** The artist, then its first name of "A & B", "A, B", "A and B", "A x B". */
export function artistVariants(artist: string): string[] {
  const out: string[] = [normArtist(artist)];
  const f = cutFeat(fold(artist));
  for (const sep of [' & ', ', ', ' and ', ' x ', ' + ', ' / ']) {
    const i = f.indexOf(sep);
    if (i > 0) { const v = normArtist(f.slice(0, i)); if (v !== '' && out.indexOf(v) < 0) out.push(v); }
  }
  return out;
}

/** The key of a song, the same on every iPod and every service: normalised artist, '|', normalised title. */
export function trackKey(artist: string, title: string): string { return `${normArtist(artist)}|${normTitle(title)}`; }
