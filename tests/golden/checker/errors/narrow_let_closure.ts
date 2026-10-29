// A let narrowed before a closure is not narrowed inside it: it may be assigned null before the closure runs.
class Box { name: string = 'box'; }
function find(k: i32): Box | null { return k > 0 ? new Box() : null; }
function later(f: () => void): void { f(); }
let b = find(1);
if (b !== null) later(() => { console.log(b.name); });
b = null;
