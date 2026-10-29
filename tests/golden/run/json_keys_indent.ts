// Object.keys of a JSON value, JSON.stringify with an indent and Array.push with several arguments (found writing the iPod demo's Genius); the output is Node's.
class Weights { a: number = 0.5; name: string = 'x, y: "z" {[]}'; list: number[] = [1, 2]; empty: number[] = []; nested: Inner = new Inner(); }
class Inner { on: boolean = true; tags: string[] = ['a\\b', '"q"']; }

const o = JSON.parse('{"b": 1, "a": {"x": [1, 2]}, "2": true, "1": null, "": "e"}');
console.log(Object.keys(o).join('|'), Object.keys(o.a).join('|'), Object.keys(o.a.x).join('|'), Object.keys(JSON.parse('{}')).length);
for (const k of Object.keys(o)) console.log(k, JSON.stringify(o[k]));

const w = new Weights();
console.log(JSON.stringify(w, null, 2));
console.log(JSON.stringify(w, null, '\t'));
console.log(JSON.stringify(w, undefined, 0));
console.log(JSON.stringify(w, null));
console.log(JSON.stringify([] as number[], null, 2), JSON.stringify(['{', '}'], null, 1));
console.log(JSON.stringify(o.a, null, 20).split('\n')[1].length);

// Array.push with several arguments (read in order, then pushed); the new length
class P { n: number = 0; constructor(n: number) { this.n = n; } }
const xs: number[] = [1];
let at = 0;
const next = (): number => ++at * 10;
console.log(xs.push(next(), next(), next()), xs.join(','));
const ps: P[] = [];
ps.push(new P(1), new P(2));
const ss: string[] = [];
ss.push('a', 'b'); ss.push('c');
console.log(ps.length, ps[1].n, ss.join(''));
