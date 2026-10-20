// Map.get may find nothing (undefined in TypeScript): its result is `i32 | undefined`, not assignable to i32.
const m: Map<string, i32> = new Map<string, i32>();
m.set('a', 1);
const v: i32 = m.get('a');
console.log(v);
