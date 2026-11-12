class Item { value: number = 1; }
function f(): void { let x: Item | null = null; try { x = new Item(); do { x = null; break; x = new Item(); } while (true); } catch (error) { return; } const bad: Item = x; }
