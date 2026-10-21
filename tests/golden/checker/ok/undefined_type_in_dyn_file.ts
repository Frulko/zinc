// A file with Dyn values (JSON.parse) keeps `undefined` as the Dyn one, yet `T | undefined` is still a type (Z0101 before the fix).
class Node2 { id = 'n'; }
function count(json: string): number { const d = JSON.parse(json); return d.length; }
function find(a: boolean): Node2 | undefined { return a ? new Node2() : undefined; }
let later: number | undefined;
const missing: string | undefined = undefined;
console.log(count('[1]'), find(true)!.id, later, missing);
