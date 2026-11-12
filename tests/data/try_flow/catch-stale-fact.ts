class Item { value: number = 1; }
function mayThrow(): void {}
function f(): void { let x: Item | null = new Item(); try { x = null; mayThrow(); } catch (error) { const bad: Item = x; } }
