class Item { value: number = 1; }
function mayThrow(): void {}
function f(): void { let x: Item | null = null; try { x = new Item(); } finally { x = null; } const bad: Item = x; }
