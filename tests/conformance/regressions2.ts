// Compiler gaps reported by the demo rework: unannotated Map<K, i32>, reduce accumulators, `?? 0` on i32 in
// fixed point, chained optional access and calls, String.lastIndexOf.
function tally(words: string[]): Map<string, i32> {
  const m = new Map<string, i32>();
  for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}
const t = tally(['a', 'b', 'a']);
console.log(t.get('a'), t.get('b'));
const counts: i32[] = [3, 4, 5];
const sum = counts.reduce((acc: i32, c: i32) => acc + c, 0);
interface Cfg { count?: i32 }
const cfg: Cfg = {};
const k: i32 = (cfg.count ?? 0) + 2;
console.log(sum, k);
interface User { name: string; friend: User | null; greet(): string }
class U implements User { name: string; friend: User | null = null; constructor(n: string) { this.name = n; } greet(): string { return 'hi ' + this.name; } }
const u = new U('a'); u.friend = new U('b');
console.log(u.friend?.greet(), u.friend?.friend?.greet() ?? 'none');
console.log('a/b/c'.lastIndexOf('/'), 'abc'.lastIndexOf('z'));
const pts = [1, 2].map(x => ({ x: x, y: x * 2 }));
console.log(pts.length, pts[1].y);
function none(): U | null { return null; }
const nobody = none();
console.log(nobody?.friend?.name ?? 'no name', u.friend?.name, (u.friend?.friend?.name ?? 'end'));
