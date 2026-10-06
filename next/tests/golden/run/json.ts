class Point { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } }
class Shape { name: string = 'shape'; pts: Point[] = []; tag: string | null = null; }
interface Item { id: i32; label: string; ok: boolean; }
const items: Item[] = [{ id: 1, label: 'a "quoted" \\ line\nbreak\ttab', ok: true }, { id: 2, label: 'é€𝄞', ok: false }];
console.log(JSON.stringify(items));
const s = new Shape();
s.pts.push(new Point(1, 2.5));
s.pts.push(new Point(-0, 1e21));
console.log(JSON.stringify(s));
s.tag = 'x';
console.log(JSON.stringify(s), JSON.stringify([s.tag, null]), JSON.stringify(null), JSON.stringify(42), JSON.stringify('hi'), JSON.stringify(true));
console.log(JSON.stringify([NaN, Infinity, 1.5]), JSON.stringify([[1, 2], [3]]), JSON.stringify(new Map<string, i32>()), JSON.stringify([] as i32[]));
const pair: [string, i32] = ['k', 7];
console.log(JSON.stringify(pair), JSON.stringify({ a: [{ b: 2 }, { b: 3 }] }));
console.log(JSON.stringify('\u0001\u001f'));
