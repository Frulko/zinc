class Item { value: number = 1; }
function mayThrow(): void {}
function f(flag: boolean): void { let x: Item | null = null; try { if (flag) x = new Item(); } catch (error) { return; } const bad: Item = x; }
