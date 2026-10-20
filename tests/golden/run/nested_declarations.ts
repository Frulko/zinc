// Functions and classes declared in a nested block or in a lambda's body are compiled where they are found (they failed with "uses a missing value")
const f = (): number => { function g(): number { return 1; } return g(); };
console.log(f());
function h(x: boolean): number { if (x) { function k(): number { return 2; } return k(); } else { function k(): number { return 3; } return k(); } }
console.log(h(true), h(false));
const p = ((): number => { class P { get v(): number { return 4; } } return new P().v; })();
console.log(p);
for (let i = 0; i < 2; i++) { function sq(n: number): number { return n * n; } console.log(sq(i + 5)); }
