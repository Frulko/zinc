class Item { value: number = 1; }
function mayThrow(): void {}
function f(flag: boolean): void { let x: Item | null = null; if (flag) x = new Item(); const bad: Item = x; }
