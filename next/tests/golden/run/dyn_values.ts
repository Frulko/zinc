// any and unknown: JSON trees, operators, conversions, narrowing
class P { constructor(public x: number, public y: number) {} sum(): number { return this.x + this.y; } }
interface Row { id: number; tag?: string; vals: number[] }
const j: any = JSON.parse('{"rows":[{"id":1,"vals":[1,2]},{"id":2,"tag":"t","vals":[]}],"name":"n","flag":false,"nothing":null}');
console.log(j.rows.length, j.rows[0].vals[1], j.name, j.flag, j.nothing, j.nothing === null, j.absent === undefined, typeof j.absent);
const rows = j.rows as Row[];
console.log(rows[1].tag ?? 'none', rows[0].tag ?? 'none', rows[0].vals.length, rows[0].id + rows[1].id);
let n: any = 1;
n = n + 1; n += '5'; n = n + 1;
console.log(n, typeof n);
const q: any = '6';
console.log(q * 2, q - 1, q + 1, -q, +q, q == 6, q === 6, q > 5, !q, !!q);
const arr: any = [1, 2], emp: any = {}, nul: any = null, und: any = undefined, tr: any = true;
console.log(arr + '', emp + '', nul + 1, und + 1, tr + tr);
const objs: any[] = [new P(1, 2), { k: 'v' }, [1, [2, 3]], 'str', 4, null, undefined, true];
for (const o of objs) console.log(typeof o, Array.isArray(o), o instanceof P);
console.log(objs);
const p: any = new P(3, 4);
p.x = 10;
console.log(p.x + p.y, (p as P).sum(), 'x' in p, 'z' in p, p);
const u: unknown = j.rows[0].id;
if (typeof u === 'number') console.log(u + 1);
function kind(v: unknown): string {
  if (typeof v === 'string') return 's' + v.length;
  if (v instanceof P) return 'P' + v.x;
  return typeof v;
}
console.log(kind('abc'), kind(new P(7, 8)), kind(3), kind(null), kind([1]));
const o2: any = {};
o2.a = 1; o2['b'] = [1, 2]; o2.c = { d: 'x' };
console.log(o2, JSON.stringify(o2));
