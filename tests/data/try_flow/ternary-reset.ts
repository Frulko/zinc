class Item { value: number = 1; }
function f(flag: boolean): void { let x: Item | null = null; try { x = new Item(); flag ? x = null : x = new Item(); } catch (error) { return; } const bad: Item = x; }
