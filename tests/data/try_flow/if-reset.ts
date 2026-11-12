class Item { value: number = 1; }
function mayThrow(): void {}
function f(flag: boolean): void { let x: Item | null = new Item(); if (flag) x = null; const bad: Item = x; }
