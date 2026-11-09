// Map<K, V>.get of a missing key is undefined, also in a program that uses `any` (ZN-798)
const m = new Map<string, boolean>();
function s(v: any): string { return '' + v; }
console.log('' + (m.get('a') === undefined) + s(1));
m.set('a', false);
const got = m.get('a');
console.log('' + (got === undefined) + ' ' + (got === false) + ' ' + s(m.get('b') === undefined));
