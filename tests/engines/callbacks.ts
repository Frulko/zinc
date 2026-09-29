import Callbacks from './callbacks/callbacks.spec';
console.log('apply', Callbacks.apply(4, (n: i32): i32 => n * 3));
console.log('nested', Callbacks.apply(5, (n: i32): i32 => Callbacks.apply(n, (m: i32): i32 => m + 7) + n));
function install(): void {
  const state = { value: 11 };
  Callbacks.keep((n: i32): i32 => {
    const values: string[] = [];
    for (let i: i32 = 0; i < 40; i++) values.push('alive-' + i);
    state.value += n;
    return state.value + values.length;
  });
}
install();
let sum: i32 = 0;
for (let i: i32 = 0; i < 3000; i++) sum += Callbacks.fire(1);
console.log('retained', sum);
Callbacks.clear();
console.log('cleared', Callbacks.fire(1));
Callbacks.keep((n: i32): i32 => { Callbacks.clear(); return n + 2; });
console.log('self-clear', Callbacks.fire(7), Callbacks.fire(7));
console.log('text', Callbacks.text('hello', (s: string): string => Callbacks.text(s, (t: string): string => t + '!') + s));
Callbacks.keep((n: i32): i32 => n + 1);
try {
  Callbacks.apply(2, (n: i32): i32 => { throw new Error('callback failure'); });
} catch (e) { console.log('caught', e.name, e.message); }
console.log('after-error', Callbacks.fire(3));
