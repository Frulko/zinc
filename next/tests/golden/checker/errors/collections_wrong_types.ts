const m: Map<string, i32> = new Map<string, i32>();
m.set(1, 2);
m.set('a', 'b');
const s: Set<string> = new Set<string>();
s.add(3);
const xs: i32[] = [3, 1, 2];
xs.sort((a: string, b: string) => 0);
const n: i32 = m.size + s.size;
