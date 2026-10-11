// Default values in object patterns (ZN-155): used when the property is undefined, not when it is null, as in JavaScript.
class P { x: number = 1; label: string | null = null; }
const { z = 5 } = {} as { z?: number };
const { w = 2 } = { w: 7 } as { w?: number };
const { x, label = 'none' } = new P();
function f({ a = 'A', b = 0 }: { a?: string; b?: number }): string { return a + b; }
console.log(z, w, x, label);
console.log(f({}), f({ a: 'x', b: 2 }));
