class Item { value: number = 1; }
function mayThrow(): void {}
class Bad { item: Item; constructor() { try { this.item = new Item(); } finally { console.log(this.item.value); } } }
