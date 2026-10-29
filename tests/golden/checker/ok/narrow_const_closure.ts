// A const narrowed where a closure is written stays narrowed inside it, as in TypeScript.
class Box { name: string = 'box'; }
function find(k: i32): Box | null { return k > 0 ? new Box() : null; }
function later(f: () => void): void { f(); }
const b = find(1);
if (b !== null) later(() => { console.log(b.name); });
function open(k: i32): void {
  const i = find(k);
  if (i === null) return;
  later(() => { console.log(i.name); });
}
open(1);
