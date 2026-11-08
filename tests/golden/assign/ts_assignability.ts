// Function and generic assignability that TypeScript accepts (ZN-1003): six spellings, the same output on every engine as in Node.

// 1. a function with a default parameter where `() => void` is expected: called by name, so the default is filled
function note(label: string = 'none'): void { console.log('note ' + label); }
let listener: () => void = () => {};
function onChange(l: () => void): void { listener = l; }
onChange(note);
listener();

// 2. `?.[` on a nullable tuple, array and string
const WORDS: [string, string][] = [['a', 'alpha'], ['b', 'beta']];
function wordOf(key: string): string { return WORDS.find((pair) => pair[0] === key)?.[1] ?? key; }
function first(xs: number[] | null): number { return xs?.[0] ?? -1; }
function letter(s: string | null): string { return s?.[1] ?? '?'; }
console.log(wordOf('a'), wordOf('z'), first([4, 5]), first(null), letter('hey'), letter(null));

// 3. resolve(undefined) on a Promise<void>
new Promise<void>((resolve) => { resolve(undefined); }).then(() => { console.log('resolved'); });

// 4. a callback with an `any` parameter where one taking an Error is expected
function onError(handler: (e: Error) => void): void { handler(new Error('boom')); }
onError((error: any) => { console.log('caught ' + error.message); });
const failing = new Promise<number>((resolve, reject) => { reject(new Error('late')); });
failing.catch((e: any) => { console.log('catch any ' + e.message); return 0; });

// 5. a Map of a class where a Map of its interface is expected
interface Named { name: string; }
class Item implements Named { name: string; constructor(n: string) { this.name = n; } }
function names(m: Map<string, Named>): string { const out: string[] = []; m.forEach((v, k) => { out.push(k + '=' + v.name); }); return out.join(','); }
const items = new Map<string, Item>();
items.set('x', new Item('ex'));
items.set('y', new Item('why'));
console.log(names(items));

// 6. catch with a callback that returns nothing (expression and block bodies), and Promise.reject(e).catch
failing.catch((e) => console.log('void body ' + e.message));
failing.catch((e) => { console.log('void block ' + e.message); }).then((v) => { console.log('after ' + String(v)); });
Promise.reject(new Error('never')).catch((e) => console.log('rejected ' + e.message));
