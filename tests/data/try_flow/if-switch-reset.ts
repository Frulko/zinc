class Item { value: number = 1; }
function f(flag: boolean, key: number): void { let x: Item | null = null; if (flag) { x = new Item(); switch (key) { case 0: x = null; break; } } else x = new Item(); const bad: Item = x; }
