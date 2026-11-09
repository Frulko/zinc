// A bounded line alignment: exact nearby anchors, coarse replacement when the search budget is exhausted.
export class DiffLine {
  before: string = ''; after: string = ''; oldLine: i32 = 0; newLine: i32 = 0;
  kind: i32 = 0; // 0 unchanged, -1 removed, 1 added
}
// shortcut: distant anchors can produce a nonminimal diff; use budgeted linear-space Myers if review needs distant alignment.
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n'), b = after === '' ? [] : after.split('\n');
  const ids = new Map<string, i32>();
  let nextId: i32 = 0;
  const identify = (lines: string[]): i32[] => lines.map((line: string): i32 => {
    const known = ids.get(line);
    if (known !== undefined) return known;
    const id = nextId++; ids.set(line, id); return id;
  });
  const oldIds = identify(a), newIds = identify(b);
  const out: DiffLine[] = [];
  let i: i32 = 0, j: i32 = 0, budget: i32 = 131072;
  const push = (kind: i32): void => {
    const row = new DiffLine(); row.kind = kind;
    if (kind <= 0) { row.oldLine = i + 1; row.before = a[i++]; }
    if (kind >= 0) { row.newLine = j + 1; row.after = b[j++]; }
    out.push(row);
  };
  while (i < a.length && j < b.length) {
    if (oldIds[i] === newIds[j]) { push(0); continue; }
    let ai: i32 = -1, bj: i32 = -1;
    for (let distance: i32 = 1; distance <= 64 && budget > 0 && ai < 0; distance++) {
      for (let x: i32 = 0; x <= distance && budget > 0; x++) {
        const y = distance - x; budget--;
        if (i + x < a.length && j + y < b.length && oldIds[i + x] === newIds[j + y]) { ai = i + x; bj = j + y; break; }
      }
    }
    if (ai < 0) { push(-1); push(1); }
    else { while (i < ai) push(-1); while (j < bj) push(1); }
  }
  while (i < a.length) push(-1);
  while (j < b.length) push(1);
  return out;
}
/** Visible indices; a negative index encodes a folded unchanged run beginning at -index-1. */
export function diffVisible(rows: DiffLine[], context: i32, expanded: i32[]): i32[] {
  const out: i32[] = [];
  for (let i: i32 = 0; i < rows.length;) {
    if (rows[i].kind !== 0 || context < 0) { out.push(i++); continue; }
    let end = i;
    while (end < rows.length && rows[end].kind === 0) end++;
    const head = i === 0 ? 0 : Math.min(context, end - i), tail = end === rows.length ? 0 : Math.min(context, end - i - head);
    if (end - i - head - tail < 3 || expanded.indexOf(i) >= 0) { while (i < end) out.push(i++); continue; }
    for (let k: i32 = 0; k < head; k++) out.push(i + k);
    out.push(-i - 1);
    for (let k = end - tail; k < end; k++) out.push(k);
    i = end;
  }
  return out;
}
export class DiffPair { left: i32 = -1; right: i32 = -1; fold: i32 = -1; }
/** Pair removed/added runs for split view without changing the underlying line edit sequence. */
export function diffPairs(rows: DiffLine[], visible: i32[], split: boolean): DiffPair[] {
  const out: DiffPair[] = [];
  for (let i: i32 = 0; i < visible.length;) {
    const at = visible[i], pair = new DiffPair();
    if (at < 0) { pair.fold = -at - 1; i++; out.push(pair); continue; }
    if (rows[at].kind === 0) { pair.left = at; pair.right = at; i++; out.push(pair); continue; }
    const removed: i32[] = [], added: i32[] = [];
    while (i < visible.length && visible[i] >= 0 && rows[visible[i]].kind < 0) removed.push(visible[i++]);
    while (i < visible.length && visible[i] >= 0 && rows[visible[i]].kind > 0) added.push(visible[i++]);
    if (!split) {
      for (const index of removed) { const p = new DiffPair(); p.left = index; out.push(p); }
      for (const index of added) { const p = new DiffPair(); p.right = index; out.push(p); }
    } else for (let k: i32 = 0; k < Math.max(removed.length, added.length); k++) {
      const p = new DiffPair(); p.left = k < removed.length ? removed[k] : -1; p.right = k < added.length ? added[k] : -1; out.push(p);
    }
  }
  return out;
}
/** A changed range within a bounded line; larger lines retain their line-level diff. */
export function diffRange(before: string, after: string): i32[] {
  if (before.length > 2000 || after.length > 2000) return [];
  let start: i32 = 0, endA: i32 = before.length, endB: i32 = after.length;
  while (start < endA && start < endB && before.charAt(start) === after.charAt(start)) start++;
  while (endA > start && endB > start && before.charAt(endA - 1) === after.charAt(endB - 1)) { endA--; endB--; }
  return [start, endA, start, endB];
}
