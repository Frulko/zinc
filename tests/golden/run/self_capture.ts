// A closure made inside the initializer of the variable it uses (`const sub = on(() => sub.remove())`, React Native's listener idiom) reads the variable
// later, once it is set: the variable lives in a cell made before the initializer runs. In a function, an async function, with let and const.
class Sub { name: string; f: () => void; constructor(name: string, f: () => void) { this.name = name; this.f = f; } remove(): void { this.f(); } }
let saved: ((s: string) => void) | null = null;
function on(name: string, cb: (s: string) => void): Sub { saved = cb; return new Sub(name, (): void => { console.log('removed', name); }); }
function fire(s: string): void { const f = saved; if (f !== null) (f as (s: string) => void)(s); }
function inFunction(): void {
  const sub = on('const', (s: string) => { console.log('got', s, 'from', sub.name); sub.remove(); });
  fire('a');
}
async function inAsync(): Promise<void> {
  let sub = on('let', (s: string) => { console.log('got', s, 'from', sub.name); sub.remove(); });
  fire('b');
}
inFunction();
inAsync();
const top = on('top', (s: string) => { console.log('got', s, 'from', top.name); });
fire('c');
