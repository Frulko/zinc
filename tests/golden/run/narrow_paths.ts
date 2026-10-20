class N { v: number = 1; next: N | null = null }
class H {
  head: N | null = null
  name: string | null = 'h'
  len(): number {
    if (this.head !== null) return this.head.v
    if (this.name) return this.name.length
    return 0
  }
  walk(): number {
    let t = 0
    let c = this.head
    while (c !== null) { t += c.v; c = c.next }
    return t
  }
}
function a(n: N): number {
  if (n.next && n.next.next) return n.next.next.v
  const x = n.next !== null ? n.next.v : -1
  if (n.next === null) return x
  return n.next.v + x
}
function b(n: N): number {
  if (!n.next) return 0
  const first = n.next.v
  n.next = null
  return first
}
function c(n: N): number {
  if (n.next !== null && n.next.next !== null) return n.next.next.v
  return 0
}
const arr: (N | null)[] = [new N(), null]
function d(i: number): number {
  if (arr[i] !== null) return arr[i]!.v
  return 0
}
const h = new H(); h.head = new N()
console.log(h.len(), h.walk(), a(new N()), b(new N()), c(new N()), d(0))
class Q { item: N | null = null; take(): void { this.item = null } }
function e(q: Q): number {
  if (q.item === null) return 0
  const a = q.item.v
  q.item = new N()      // a write: known to be an N again
  const b = q.item.v
  return a + b
}
function f2(q: Q): number {
  if (!q.item) return -1
  let s = 0
  for (let i = 0; i < 2; i++) s += q.item.v   // nothing in the loop writes q.item
  return s
}
const q1 = new Q(); q1.item = new N()
console.log(e(q1), f2(q1))
