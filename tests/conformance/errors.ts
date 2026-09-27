// LNG-15 / RT-05: throw, try/catch/finally, custom errors, using
class ParseError extends Error {
  constructor(public line: i32, msg: string) { super(msg); }
}
function parse(s: string): i32 {
  if (s.length === 0) throw new ParseError(1, 'empty input');
  const n = parseInt(s);
  if (Number.isNaN(n)) throw new TypeError(`not a number: ${s}`);
  return n;
}
function sum(xs: string[]): i32 {
  let total: i32 = 0;
  for (const x of xs) total += parse(x);
  return total;
}
for (const input of [['1', '2', '3'], ['4', ''], ['5', 'x']]) {
  try {
    console.log('sum', sum(input));
  } catch (e) {
    if (e instanceof ParseError) console.log('parse error at line', e.line, e.message);
    else if (e instanceof TypeError) console.log('type error:', e.message);
    else console.log('other', `${e}`);
  } finally {
    console.log('done', input.length);
  }
}
function nested(): string {
  try {
    try { throw new RangeError('inner'); }
    finally { console.log('inner finally'); }
  } catch (e) { return `caught ${e.name}: ${e.message}`; }
}
console.log(nested());
class Res {
  constructor(public name: string) { console.log('open', name); }
  [Symbol.dispose](): void { console.log('close', this.name); }
}
function useRes(): void {
  using a = new Res('a');
  using b = new Res('b');
  console.log('using', a.name, b.name);
}
useRes();
const cb = [1, 2, 3].map(x => { if (x > 5) throw new Error('big'); return x * 2; });
console.log(cb, `${new Error('plain')}`);
