class Item { value: number = 1; }
function mayThrow(): void {}
class Bad { item: Item; constructor(flag: boolean) { try { if (flag) this.item = new Item(); } catch (error) { throw error; } } }
