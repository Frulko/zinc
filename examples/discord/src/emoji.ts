// The emoji picker's data: Unicode's emoji by group (assets/emoji.txt, written by tools/emoji.py from emoji-test.txt), read when the picker
// first opens; a search by name; the ones used last, kept on this machine (zinc:storage).
import { readText } from 'zinc:assets';
import * as storage from 'zinc:storage';

export class EmojiGroup { name = ''; chars: string[] = []; names: string[] = []; }

let groups: EmojiGroup[] = [];
/** The groups in Unicode's order (Smileys & Emotion first). */
export function emojiGroups(): EmojiGroup[] {
  if (groups.length > 0) return groups;
  const lines = readText('emoji.txt').split('\n');
  for (let i = 1; i < lines.length; i++) {   // the first line says where the list comes from
    const l = lines[i];
    if (l === '') continue;
    if (l.startsWith('@ ')) { const g = new EmojiGroup(); g.name = l.slice(2); groups.push(g); continue; }
    const sp = l.indexOf(' ');
    if (sp <= 0 || groups.length === 0) continue;
    const g = groups[groups.length - 1];
    g.chars.push(l.slice(0, sp)); g.names.push(l.slice(sp + 1));
  }
  return groups;
}

/** The emoji whose name holds every word of `q` (at most `most`), in the list's order. */
export function searchEmoji(q: string, most: i32): string[] {
  const words = q.toLowerCase().split(' ').filter((w: string) => w !== '');
  const out: string[] = [];
  for (const g of emojiGroups())
    for (let i = 0; i < g.chars.length && out.length < most; i++)
      if (words.every((w: string) => g.names[i].indexOf(w) >= 0)) out.push(g.chars[i]);
  return out;
}

const RECENT_KEY = 'recent-emoji', RECENT_MAX = 24;
/** The emoji used last, the latest first: a Unicode emoji, or a custom one as <:name:id> (<a:name:id> animated). */
export function recentEmoji(): string[] {
  const out: string[] = [];
  try { const v: any = JSON.parse(storage.get(RECENT_KEY)); if (Array.isArray(v)) for (const x of v) out.push(`${x}`); } catch (e) {}
  return out;
}
export function usedEmoji(e: string): void {
  const list = recentEmoji().filter((x: string) => x !== e);
  list.unshift(e);
  storage.set(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}
/** <:name:id> or <a:name:id> as [id, name, animated '1' or '']; null for a Unicode emoji. */
export function customParts(e: string): string[] | null {
  const m = /^<(a?):(\w+):(\d+)>$/.exec(e);
  return m !== null ? [m[3], m[2], m[1]] : null;
}
