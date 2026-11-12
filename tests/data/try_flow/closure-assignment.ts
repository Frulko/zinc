class Item { value: number = 1; }
function mayThrow(): void {}
class Bad { item: Item; constructor() { const later = (): void => { this.item = new Item(); }; console.log(this.item.value); } }
