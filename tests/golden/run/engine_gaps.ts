// ZN-852: TypeScript the engine refused or got wrong (found writing the zinc:ipod stand-in); the output is Node's.
interface C { xs: string[]; n: number; }
interface Picture { width: i32; height: i32; rgba: u8[]; }
function fail<T>(m: string): Promise<T> { return Promise.reject<T>(new Error(m)); }
function b(): Promise<C> { return Promise.resolve({ xs: [], n: 0 }); }
function pic(size: i32): Promise<Picture> { return Promise.resolve({ width: size, height: size, rgba: [] as u8[] }); }
function pic0(): Promise<Picture> { return Promise.resolve({ width: 0, height: 0, rgba: [] as u8[] }); }
function wrap<T>(v: T): T[] { return [v]; }
const hex = (255).toString(16);
const id = <T>(v: T): T => v;
const s = ''; const t = s ? 1 : 2; if (s) console.log('x');
function v(): Promise<void> { return fail<void>('no'); }

// Number.prototype.toString(radix)
console.log(hex, (-255).toString(2), (0.5).toString(2), (3.75).toString(16), (0.1).toString(3), (123456789).toString(36), (0).toString(7), (1e21).toString(16));
const r: number = 36;
console.log((35).toString(r), (0.1).toString(2), (-7.25).toString(8));
// generic arrow functions
console.log(id<string>('a'), id(3));
// strings and numbers as conditions
const n0 = 0; const nan = 0 / 0; const n5 = 5;
console.log(t, n0 ? 'y' : 'n', nan ? 'y' : 'n', n5 ? 'y' : 'n', !s, !n5, s || 'dflt');
if (s && n5) console.log('bad'); else console.log('and ok');
if (n5 && 'z') console.log('both');
let w = 3; while (w) w--; console.log(w);
// literals typed by the wanted type through a generic call
const ws: C[] = wrap({ xs: [], n: 0 });
console.log(ws.length, ws[0].xs.length);
// Promise<void> made by generic code
async function main(): Promise<void> {
  console.log('awaited', await awaited(true), await awaited(false));
  console.log('empty', (await emptyAfter()).length, (await emptyCaught()).length);
  const c = await b();
  console.log(c.xs.length, c.n);
  const p = await pic(3);
  const q = await pic0();
  console.log(p.width, p.height, p.rgba.length, q.width);
  try { await v(); } catch (e) { console.log('caught', e.message); }
  try { await fail<void>('direct'); } catch (e) { console.log('caught', e.message); }
  await Promise.reject<void>(new Error('r')).catch((e: Error) => { console.log('catch', e.message); });
  fail<void>('then').then(() => console.log('never')).catch((e: Error) => console.log('then-rej', e.message));
  await Promise.resolve(1).then((x: number) => console.log('then', x));
}
// an empty array literal in one branch of ?: takes the other branch's array type
class Line { text: string; constructor(t: string) { this.text = t; } }
function linesOf(on: boolean): Line[] { return on ? [new Line('a'), new Line('b')] : []; }
let joined = '';
for (const l of linesOf(true).length > 1 ? linesOf(true) : []) joined += l.text;
const none = linesOf(false).length === 0 ? [] : linesOf(true);
console.log(joined, none.length);
// ... the type of `any` when the other branch is any, and the array a promise holds when the other branch awaits it
const loose: any = JSON.parse('{"list":[1,2]}');
const got = loose.list !== undefined ? loose.list : [], missing = loose.none !== undefined ? loose.none : [];
console.log(got.length, missing.length);
async function names(): Promise<string[]> { return ['x', 'y']; }
async function awaited(on: boolean): Promise<i32> { const xs = on ? await names() : []; return xs.length as i32; }
// `return []` in an async function takes the array the promise holds, after an await and in a catch
async function emptyAfter(): Promise<string[]> { await names(); return []; }
async function emptyCaught(): Promise<string[]> { try { await names(); throw new Error('no'); } catch (e) { return []; } }
// await in a nested ?:, and in a single-level one beside a number
async function one(): Promise<i32> { return 1; }
async function two(): Promise<i32> { return 2; }
function show(xs: string[]): void { console.log('nested', xs.length); }
async function pick(w: string): Promise<i32> { const n = w === 'x' ? await one() : w === 'y' ? await two() : 0; return n; }
async function listOf(w: string): Promise<void> { show(w === 'x' ? await names() : w === 'y' ? await names() : []); }
async function single(c: boolean): Promise<i32> { const x = c ? await two() : 0; return x; }
async function later(): Promise<void> {
  console.log('pick', await pick('x'), await pick('y'), await pick('z'));
  await listOf('x'); await listOf('z');
  console.log('single', await single(true), await single(false));
}
main();
setTimeout(() => { later(); }, 0);
