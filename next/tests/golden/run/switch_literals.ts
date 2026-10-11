// A switch with a case for each string of a literal union alias returns on every path (ZN-155); with one missing it is Z0110.
type K = 'a' | 'b';
function f(k: K): number { switch (k) { case 'a': return 1; case 'b': return 2; } }
function g(k: K): string { switch (k) { case 'a': return 'A'; case 'b': return 'B'; } }
console.log(f('a'), f('b'), g('b'));
