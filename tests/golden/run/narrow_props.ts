// narrowing of a property of a local: node.left !== null, then node.left.value
class Node { value: i32; next: Node | null = null; name: string | null = null; constructor(v: i32) { this.value = v; } }
function sum(n: Node | null): i32 {
  let total = 0;
  let cur: Node | null = n;
  while (cur !== null) { total += cur.value; cur = cur.next; }
  return total;
}
const a = new Node(1);
a.next = new Node(2);
a.next.next = new Node(3);
console.log(sum(a));
function nextValue(x: Node): i32 {
  if (x.next === null) return -1;
  return x.next.value;
}
const second = a.next;
console.log(nextValue(a), nextValue(second), nextValue(new Node(9)));
function label(x: Node): string {
  if (x.name !== null) return x.name.toUpperCase();
  x.name = 'anon';
  return x.name.length + x.name;
}
console.log(label(a), label(a));
function reset(x: Node): i32 {
  if (x.next === null) return 0;
  x.next = null;
  return x.next === null ? 7 : 8;
}
console.log(reset(a));
