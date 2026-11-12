class Item { value: number = 1; }
class Holder { item: Item | null = new Item(); next(): Holder { return this; } }
const holder = new Holder();
if (holder.item !== null) { holder.next(); console.log(holder.item.value); }
