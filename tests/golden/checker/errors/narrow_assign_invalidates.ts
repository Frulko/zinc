class N { v: number = 1 }
class Q { item: N | null = null }
function g(q: Q, other: N | null): number {
  if (q.item === null) return 0
  q.item = other
  return q.item.v
}
