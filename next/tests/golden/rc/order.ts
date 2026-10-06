// Destruction order, written to stderr by ZN_TRACE_FREE: an object's fields in reverse order of declaration (as C++ members),
// an array's elements first to last, a Map's entries first to last, a local at its last use (not at the end of the scope).
class Leaf { constructor(public tag: string) {} }
class Pair { constructor(public first: Leaf, public second: Leaf) {} }
class Tree { constructor(public left: Pair, public name: string, public right: Pair) {} }

function fields(): void {
  const t = new Tree(new Pair(new Leaf('a'), new Leaf('b')), 'T', new Pair(new Leaf('c'), new Leaf('d')));
  console.log('tree built', t.name);
}
function elements(): void {
  const xs: Leaf[] = [new Leaf('p'), new Leaf('q'), new Leaf('r')];
  console.log('array built', xs.length);
}
function entries(): void {
  const m = new Map<string, Leaf>();
  m.set('k1', new Leaf('v1'));
  m.set('k2', new Leaf('v2'));
  m.delete('k1');
  console.log('map built', m.size);
}
function locals(): void {
  const first = new Leaf('first');
  console.log('first', first.tag);
  const second = new Leaf('second');
  console.log('second', second.tag);
  console.log('end of locals');
}
fields();
console.log('--');
elements();
console.log('--');
entries();
console.log('--');
locals();
const keep = new Leaf('global');
console.log('end');
