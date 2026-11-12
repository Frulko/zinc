class Item { value: number = 1; }
function mayThrow(): void {}
class Bad { item: Item; constructor() { try { mayThrow(); this.item = new Item(); } catch (error) {} } }
