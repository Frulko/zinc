class Item { value: number = 1; }
function mayThrow(): void {}
class Bad { item: Item; constructor() { try { console.log(this.item.value); this.item = new Item(); } catch (error) { throw error; } } }
