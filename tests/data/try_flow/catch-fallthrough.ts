class Item { value: number = 1; }
function mayThrow(): void {}
function f(): void { let x: Item | null = null; try { mayThrow(); x = new Item(); } catch (error) {} const bad: Item = x; }
