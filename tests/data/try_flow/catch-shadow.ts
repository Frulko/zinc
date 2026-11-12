class Item { value: number = 1; }
function f(): void { let x: Item | null = null; try { throw new Error('expected'); } catch (x) { x = new Error('caught'); } const bad: Item = x; }
