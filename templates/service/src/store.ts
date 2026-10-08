// The items, in memory (swap for zinc:sqlite or zinc:storage to keep them across restarts).
export class Item {
  id: i32; title: string; done: boolean = false;
  constructor(id: i32, title: string) { this.id = id; this.title = title; }
}

export class Store {
  items: Item[] = [];
  next: i32 = 1;
  add(title: string): Item { const it = new Item(this.next++, title); this.items.push(it); return it; }
  find(id: i32): Item | null { for (const it of this.items) if (it.id === id) return it; return null; }
  remove(id: i32): boolean {
    for (let i = 0; i < this.items.length; i++) if (this.items[i].id === id) { this.items.splice(i, 1); return true; }
    return false;
  }
}
