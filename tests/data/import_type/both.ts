console.log('both.ts ran');
export interface Pair { a: i32; b: i32 }
export function sum(p: Pair): i32 { return p.a + p.b; }
