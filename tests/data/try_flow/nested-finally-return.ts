class Item { value: number = 1; }
function mayThrow(): void {}
class Bad { item: Item; constructor() { try { try { throw new Error('expected'); } finally {} } finally { return; } } }
