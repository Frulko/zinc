class N { v: number = 1 }
class Q { item: N | null = null; take(): void { this.item = null } }
function g(q: Q): number {
  if (q.item === null) return 0
  q.take()
  return q.item.v
}
