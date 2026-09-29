function* exchange(): Generator<number, number, number> {
  const first = yield 1;
  console.log('sent', first);
  const second = yield first + 2;
  return second + 3;
}
const g = exchange();
console.log(g.next(99));
console.log(g.next(10));
console.log(g.next(20));
console.log(g.next(30));
function* text(): Generator<string, string, string> { const word = yield 'ready'; return word + '!'; }
const t = text(); t.next(); console.log(t.next('hello'));
function* interrupted(): Generator<number, number, number> { try { const x = yield 1; return x; } catch (e) { console.log('caught',e.message); } return 42; }
const e = interrupted(); e.next(); console.log(e.throw(new Error('injected')));
const c = interrupted(); c.next(); console.log(c.return(55));
function* delegate(): Generator<number, number, number> { const result = yield* exchange(); return result + 100; }
const d = delegate(); console.log('delegate', d.next().value, d.next(11).value, d.next(22).value);
function* list(): Generator<number> { const end: any = yield* [7,8]; console.log('array result', end === undefined); }
const a = list(); console.log(a.next().value, a.next().value, a.next().done);
