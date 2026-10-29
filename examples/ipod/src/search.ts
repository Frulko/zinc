// Searching: one way to match for every search field of the app and the global search. Text is folded (lower case, accents and other
// combining marks removed after a canonical decomposition, so "beyonce" finds "Beyoncé" and "ELAN" finds "élan"), and a query matches
// when each of its words is in the text: "abbey beatles" finds the album by its title and artist together.

/** `s` folded for a search: NFD, combining marks (U+0300 to U+036F) dropped, lower case. ASCII text is only lowered. */
export function fold(s: string): string {
  let ascii = true;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) { ascii = false; break; }
  if (ascii) return s.toLowerCase();
  const d = s.normalize('NFD');
  let out = '', from = 0;
  for (let i = 0; i < d.length; i++) {
    const c = d.charCodeAt(i);
    if (c >= 0x300 && c <= 0x36f) { out += d.slice(from, i); from = i + 1; }
  }
  return (out + d.slice(from)).toLowerCase();
}

/** The words of a query, folded ([] for an empty query: everything matches). */
export function words(query: string): string[] {
  const out: string[] = [];
  for (const w of fold(query).split(' ')) if (w !== '') out.push(w);
  return out;
}

/** Each word is in `folded` (a text already folded, several fields joined by a space). */
export function matches(folded: string, ws: string[]): boolean {
  for (const w of ws) if (folded.indexOf(w) < 0) return false;
  return true;
}

/** The fields shown, folded and joined, ready for `matches`. */
export function hay(fields: string[]): string { return fold(fields.join(' ')); }
