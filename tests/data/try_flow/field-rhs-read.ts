class Item { value: number = 1; }
class Bad { item: Item; constructor() { try { this.item = this.item; } catch (error) { throw error; } } }
