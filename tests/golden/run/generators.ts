// generators: lazy evaluation, loops, conditionals, try/catch around yield, break out of for-of
function* count(n: i32): Generator<i32> {
  console.log('count start');
  for (let i = 0; i < n; i++) {
    console.log('yield', i);
    yield i;
  }
  console.log('count end');
}
function* evens(limit: i32): Generator<i32> {
  let i = 0;
  while (i < limit) {
    if (i % 2 === 0) yield i;
    i++;
  }
}
function* naturals(): Generator<i32> {
  let i = 0;
  while (true) {
    yield i;
    i++;
  }
}
function* words(): Generator<string> {
  yield 'a';
  try {
    yield 'b';
    throw new Error('inside');
  } catch (e) {
    yield 'caught ' + e.message;
  }
  yield 'z';
}
function* nested(): Generator<i32> {
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      if (j === 1 && i === 0) continue;
      yield i * 10 + j;
    }
  }
  return;
}
for (const x of count(3)) console.log('got', x);
const e: i32[] = [];
for (const x of evens(10)) e.push(x);
console.log(e);
for (const x of naturals()) {
  if (x > 3) break;
  console.log('nat', x);
}
const w: string[] = [];
for (const x of words()) w.push(x);
console.log(w);
for (const x of nested()) console.log('n', x);
