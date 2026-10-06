// Map.get may find nothing (undefined in TypeScript): it can only be the left side of ??.
const m: Map<string, i32> = new Map<string, i32>();
m.set('a', 1);
const v: i32 = m.get('a');
console.log(v);
