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
// array literals longer than 256 elements (the C++ was a fold expression, which clang limits to 256 operands)
const long300: i32[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99,
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299];
console.log(long300.length, long300.reduce<i32>((a: i32, b: i32): i32 => a + b, 0), long300[299]);
// closures created inside async functions outlive the async frame (captured locals are copied, cells shared)
let savedHello: (() => void) | null = null;
function tick(ms: number): Promise<void> { return new Promise<void>(r => { setTimeout(r, ms); }); }
async function setupHello(name: string): Promise<void> {
  const greeting = 'hello ' + name;
  let calls = 0;
  savedHello = () => { calls++; console.log(greeting, calls); };
  await tick(1);
}
async function runHello(): Promise<void> {
  await setupHello('zinc');
  await tick(2);
  const f = savedHello;
  if (f !== null) { f(); f(); }
}
runHello();
