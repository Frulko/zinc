class Item { value: number = 1; }
function mayThrow(): void {}
function f(flag: boolean): void { let x: Item | null = null; try { x = new Item(); if (flag) x = null; } catch (error) { return; } const bad: Item = x; }
