// The model picker's search: what a typed text keeps of a list of choices, and how the kept ones group by provider.

/** Accented Latin letters and what they read as. */
const ACCENTED = 'àáâãäåāăąçćčďèéêëēėęěìíîïīįñńňòóôõöøōőùúûüūůűųýÿžźżśšşłßæœ';
const PLAIN = ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'c', 'c', 'c', 'd', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'i', 'i', 'i',
  'i', 'i', 'i', 'n', 'n', 'n', 'o', 'o', 'o', 'o', 'o', 'o', 'o', 'o', 'u', 'u', 'u', 'u', 'u', 'u', 'u', 'u', 'y', 'y', 'z', 'z', 'z',
  's', 's', 's', 'l', 'ss', 'ae', 'oe'];

/** `Évaluer GPT` → `evaluer gpt`: lower case, accents dropped, to compare without either.
 *  ponytail: the Latin letters above; String.normalize('NFD') when the engine has it. */
export function fold(s: string): string {
  const t = s.toLowerCase();
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t.charAt(i);
    const k = ACCENTED.indexOf(c);
    out += k < 0 ? c : PLAIN[k];
  }
  return out;
}

/** One choice as the picker sees it. */
export class Pickable {
  readonly id: string;
  readonly label: string;
  /** The provider it belongs to ('' none: the default, or a CLI with one provider). */
  readonly group: string;
  constructor(id: string, label: string, group: string) { this.id = id; this.label = label; this.group = group; }
}

/** The indexes of the choices whose id or label holds `query` anywhere, case and accents aside; every word of it when it
 *  has several (`go glm` finds `opencode-go/glm-5.3`). An empty query keeps them all. */
export function filter(items: Pickable[], query: string): i32[] {
  const words = fold(query).trim().split(' ').filter((w: string) => w !== '');
  const out: i32[] = [];
  for (let i = 0; i < items.length; i++) {
    const hay = fold(items[i].id) + ' ' + fold(items[i].label) + ' ' + fold(items[i].group);
    if (words.every((w: string) => hay.indexOf(w) >= 0)) out.push(i);
  }
  return out;
}

/** A row of the list: a provider's heading (`index` -1) or a choice. */
export class Row {
  readonly heading: string;
  readonly index: i32;
  constructor(heading: string, index: i32) { this.heading = heading; this.index = index; }
}

/** The kept choices in rows: the ungrouped first (the default), then each provider under its heading, in the order the
 *  providers first appear. Headings only when there are several providers. */
export function rows(items: Pickable[], kept: i32[]): Row[] {
  const groups: string[] = [];
  for (const i of kept) if (items[i].group !== '' && groups.indexOf(items[i].group) < 0) groups.push(items[i].group);
  const out: Row[] = [];
  for (const i of kept) if (items[i].group === '') out.push(new Row('', i));
  for (const g of groups) {
    if (groups.length > 1) out.push(new Row(g, -1));
    for (const i of kept) if (items[i].group === g) out.push(new Row('', i));
  }
  return out;
}

/** The next choice row from `at` in direction `dir` (1 down, -1 up), wrapping; headings are skipped. -1 when there is none. */
export function step(list: Row[], at: i32, dir: i32): i32 {
  const n = list.length;
  for (let k = 1; k <= n; k++) {
    const j = ((at + dir * k) % n + n) % n;
    if (list[j].index >= 0) return j;
  }
  return -1;
}
