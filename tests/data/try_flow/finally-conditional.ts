class Item { value: number = 1; }
function f(flag: boolean): void { let x: Item | null = null; try { x = new Item(); } finally { if (flag) x = null; } const bad: Item = x; }
